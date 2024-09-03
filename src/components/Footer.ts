export async function renderFooter() {
  const response = await fetch('footer.html');
  const html = await response.text();
  return html;
}