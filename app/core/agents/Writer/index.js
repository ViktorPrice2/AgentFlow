export async function execute(payload = {}, ctx) {
  // payload.template (string) and payload.vars (object)
  const template = payload.template || (payload.step && payload.step.override && payload.step.override.template) || '';
  const vars = { ...(payload.vars || {}), ...(payload.step && payload.step.override && payload.step.override.vars || {}) };
  // simple mustache-like replace
  const out = template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const parts = key.split('.');
    let v = vars;
    for (const p of parts) { v = v ? v[p] : undefined; }
    return v == null ? '' : String(v);
  });
  const next = { ...payload, content: out };
  await ctx.log('writer_rendered', { length: String(out.length) });
  return next;
}

export default { execute };
