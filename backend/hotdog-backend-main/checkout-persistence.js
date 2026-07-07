'use strict';

function isDuplicate(error) {
  return error?.code === '23505';
}

function createSupabaseCheckoutRepository(supabase) {
  return {
    async insertAttempt(record) {
      const { data, error } = await supabase
        .from('web_checkout_attempts')
        .insert(record)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async getAttempt(checkoutAttemptId) {
      const { data, error } = await supabase
        .from('web_checkout_attempts')
        .select('*')
        .eq('checkout_attempt_id', checkoutAttemptId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateAttempt(checkoutAttemptId, changes) {
      const { data, error } = await supabase
        .from('web_checkout_attempts')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('checkout_attempt_id', checkoutAttemptId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async insertWebOrder(record) {
      const { data, error } = await supabase
        .from('web_orders')
        .insert(record)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async getWebOrder(checkoutAttemptId) {
      const { data, error } = await supabase
        .from('web_orders')
        .select('*')
        .eq('checkout_attempt_id', checkoutAttemptId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  };
}

async function claimCheckoutAttempt(repository, record) {
  try {
    return { claimed: true, attempt: await repository.insertAttempt(record) };
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const existing = await repository.getAttempt(record.checkout_attempt_id);
    if (!existing) throw error;
    return { claimed: false, attempt: existing };
  }
}

// El KDS real (maracayos.duckdns.org/kds/kds.html) filtra web_orders.location
// por NOMBRE COMPLETO exacto ('North Miami', 'Doral', 'Downtown Miami'), no
// por el codigo corto del checkout. sede sí guarda el codigo corto (nmb/doral/
// downtown), consistente con pos_integration_config.sede_id.
const SEDE_DISPLAY_NAMES = { nmb: 'North Miami', doral: 'Doral', downtown: 'Downtown Miami' };

function webOrderFromAttempt(attempt) {
  return {
    customer_name: attempt.customer?.name || '',
    customer_phone: attempt.customer?.phone || '',
    customer_email: attempt.customer?.email || '',
    items: attempt.items || [],
    total: Number(attempt.total || 0),
    payment_id: attempt.payment_id,
    receipt_url: attempt.receipt_url || '',
    order_type: attempt.order_type,
    location: SEDE_DISPLAY_NAMES[attempt.location] || attempt.location,
    sede: attempt.location,
    notes: attempt.notes || '',
    status: 'paid',
    checkout_attempt_id: attempt.checkout_attempt_id,
    square_order_id: attempt.square_order_id,
    payment_status: 'approved',
    persistence_error: null
  };
}

async function persistApprovedCheckout(repository, attempt) {
  try {
    let order;
    try {
      order = await repository.insertWebOrder(webOrderFromAttempt(attempt));
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      order = await repository.getWebOrder(attempt.checkout_attempt_id);
      if (!order) throw error;
    }

    const updatedAttempt = await repository.updateAttempt(attempt.checkout_attempt_id, {
      payment_status: 'approved',
      persistence_status: 'persisted',
      persistence_error: null
    });
    return { persisted: true, order, attempt: updatedAttempt };
  } catch (error) {
    try {
      await repository.updateAttempt(attempt.checkout_attempt_id, {
        payment_status: 'approved',
        persistence_status: 'failed',
        persistence_error: String(error?.code || error?.message || 'database_error').slice(0, 500)
      });
    } catch (_) {
      // El log estructurado del caller conserva los IDs si Supabase no responde.
    }
    return { persisted: false, error };
  }
}

async function reconcileApprovedCheckout(repository, checkoutAttemptId) {
  const attempt = await repository.getAttempt(checkoutAttemptId);
  if (!attempt) return { found: false };
  if (attempt.payment_status !== 'approved' || !attempt.payment_id || !attempt.square_order_id) {
    return { found: true, ready: false, attempt };
  }
  if (attempt.persistence_status === 'persisted') {
    return {
      found: true,
      ready: true,
      persisted: true,
      attempt,
      order: await repository.getWebOrder(checkoutAttemptId)
    };
  }
  const result = await persistApprovedCheckout(repository, attempt);
  return { found: true, ready: true, ...result };
}

module.exports = {
  createSupabaseCheckoutRepository,
  claimCheckoutAttempt,
  persistApprovedCheckout,
  reconcileApprovedCheckout,
  webOrderFromAttempt
};
