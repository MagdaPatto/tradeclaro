export default function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  res.status(200).json({
    configured: !!key,
    length: key ? key.length : 0,
    preview: key ? key.slice(0, 10) + '...' : 'NOT SET'
  });
}
