export async function renderHeader() {
  const response = await fetch('header.html');
  const html = await response.text();
  return html;
}