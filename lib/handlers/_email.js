async function sendEmail({ to, subject, html, template }) {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.FROM_EMAIL || 'Nivara Jewellery <support@nivarajewellery.com>';
  const from = configuredFrom.includes('onboarding@resend.dev')
    ? 'Nivara Jewellery <support@nivarajewellery.com>'
    : configuredFrom;

  if (!apiKey || !to) {
    return { skipped: true };
  }

  const payload = { from, to, subject };

  if (template) {
    payload.template = template;
  } else {
    payload.html = html;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Unable to send email');
  }

  return response.json();
}

module.exports = { sendEmail };
