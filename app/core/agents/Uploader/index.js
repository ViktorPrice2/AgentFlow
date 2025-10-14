export async function execute(payload = {}, ctx) {
  const content = payload.content || payload.text || '';
  const filename = (payload.filename || `upload_${Date.now()}.txt`).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const rel = `uploads/${filename}`;
  const path = await ctx.setArtifact(rel, content);
  await ctx.log('uploader_uploaded', { path });
  const next = { ...payload, _uploaded: (payload._uploaded || []).concat([path]) };
  return next;
}

export default { execute };
