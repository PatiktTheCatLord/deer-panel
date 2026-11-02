// A row of simple pine silhouettes along the bottom of an SVG (seeded, so every render is the same).
function drawForest(svg, width, height, seed = 1, fill = '#13261e') {
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let paths = '';
  for (let x = -20; x < width + 40; x += 26 + rand() * 30) {
    const h = height * (0.35 + rand() * 0.65);
    const w = h * (0.42 + rand() * 0.12);
    const top = height - h;
    // three stacked triangles make a pine
    for (let k = 0; k < 3; k++) {
      const y0 = top + (h * 0.28) * k;
      const half = (w / 2) * (0.55 + 0.22 * k);
      paths += `M${x} ${y0} L${x + half} ${y0 + h * 0.42} L${x - half} ${y0 + h * 0.42} Z `;
    }
    paths += `M${x - 3} ${height - h * 0.18} h6 V${height} h-6 Z `;
  }
  svg.innerHTML = `<path d="${paths}" fill="${fill}"/>`;
}
