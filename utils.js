/* utils.js - small shared helpers */
export function shadeColor(col, percent) {
  const f = parseInt(col.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent;
  const R = f>>16, G = f>>8&0x00FF, B = f&0x0000FF;
  const newR = Math.round((t-R)*p/100)+R;
  const newG = Math.round((t-G)*p/100)+G;
  const newB = Math.round((t-B)*p/100)+B;
  return `rgb(${newR},${newG},${newB})`;
}