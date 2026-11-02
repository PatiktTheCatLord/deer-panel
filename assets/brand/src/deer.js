// The Deer Panel mark, shared by every brand page. Same drawing as panel/assets/icon.png.
// <span data-deer="icon"></span>  rounded forest-green tile with the coloured deer (the app icon)
// <span data-deer="deer"></span>  the coloured deer alone, transparent around it
// <span data-deer="mark"></span>  deer silhouette in currentColor, eyes, nose and blaze cut out
// <span data-deer="line"></span>  outline drawing in currentColor
(() => {
  const C = { line: '#3b2417', fur: '#d49a5f', shade: '#b97d45', cream: '#f7e7cf', inner: '#e8b49c', antler: '#7a4a2b', ink: '#24150d', tile: '#2f5b4c' };
  const HEAD = 'M128 86 C 164 86 184 106 182 134 C 180 156 166 172 158 190 C 152 206 142 216 128 216 C 114 216 104 206 98 190 C 90 172 76 156 74 134 C 72 106 92 86 128 86 Z';
  const EAR = 'M86 112 C 64 90 30 86 16 96 C 22 116 54 130 86 127 Z';
  const EAR_IN = 'M80 114 C 64 100 40 96 30 101 C 36 113 58 122 80 121 Z';
  const ANTLER = 'M110 94 C 104 70 92 52 76 36 M100 68 C 86 66 74 58 64 46 M88 50 C 92 40 92 30 88 18';
  const BLAZE = 'M128 100 C 135 112 135 126 128 136 C 121 126 121 112 128 100 Z';
  const MUZZLE = 'M108 178 C 108 165 148 165 148 178 C 148 201 140 214 128 214 C 116 214 108 201 108 178 Z';
  const NOSE = 'M117 190 C 117 183 139 183 139 190 C 139 197 133 202 128 202 C 123 202 117 197 117 190 Z';
  const MOUTH = 'M128 202 V206 M122 208 Q128 212 134 208';
  const BROW = 'M90 133 Q 94 127 101 126';
  const both = s => `${s}<g transform="translate(256 0) scale(-1 1)">${s}</g>`;
  const eyeShape = fill => `<ellipse cx="104" cy="141" rx="10" ry="11.5" transform="rotate(-12 104 141)" fill="${fill}"/>`;
  const stroke = (color, width) => `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  let n = 0;

  // The coloured deer in a 256 box (head centre ~128,150).
  const deer = id => `
    ${both(`<path d="${ANTLER}" fill="none" ${stroke(C.line, 17)}/><path d="${ANTLER}" fill="none" ${stroke(C.antler, 7.5)}/>`)}
    ${both(`<path d="${EAR}" fill="${C.fur}" ${stroke(C.line, 6)}/><path d="${EAR_IN}" fill="${C.inner}"/>`)}
    <defs><clipPath id="${id}"><path d="${HEAD}"/></clipPath></defs>
    <path d="${HEAD}" fill="${C.fur}"/>
    <g clip-path="url(#${id})"><path d="M160 90 C 190 120 180 170 150 220 L 200 220 L 200 90 Z" fill="${C.shade}" opacity=".55"/></g>
    <path d="${BLAZE}" fill="${C.cream}" opacity=".9"/>
    <path d="${MUZZLE}" fill="${C.cream}"/>
    <path d="${HEAD}" fill="none" ${stroke(C.line, 6)}/>
    ${both(`${eyeShape(C.ink)}<circle cx="107.5" cy="136.5" r="3.4" fill="#fff"/><circle cx="100" cy="146" r="1.5" fill="#fff" opacity=".7"/><path d="${BROW}" fill="none" ${stroke(C.ink, 3)}/>`)}
    <path d="${NOSE}" fill="${C.ink}"/><ellipse cx="123" cy="187.5" rx="3.6" ry="2" fill="#fff" opacity=".45"/>
    <path d="${MOUTH}" fill="none" ${stroke(C.ink, 3)}/>`;

  const svgs = {
    icon: id => `<svg viewBox="0 0 256 256"><rect x="8" y="8" width="240" height="240" rx="56" fill="${C.tile}"/>
      <g transform="translate(128 132) scale(.98) translate(-128 -128)">${deer(id)}</g></svg>`,
    deer: id => `<svg viewBox="4 8 248 218">${deer(id)}</svg>`,
    mark: id => `<svg viewBox="4 8 248 218"><defs><mask id="${id}">
        ${both(`<path d="${ANTLER}" fill="none" ${stroke('#fff', 12)}/><path d="${EAR}" fill="#fff" ${stroke('#fff', 6)}/>`)}
        <path d="${HEAD}" fill="#fff" ${stroke('#000', 14)}/><path d="${HEAD}" fill="#fff"/>
        <path d="${BLAZE}" fill="#000"/>${both(eyeShape('#000'))}<path d="${NOSE}" fill="#000"/>
      </mask></defs><rect x="0" y="0" width="256" height="256" fill="currentColor" mask="url(#${id})"/></svg>`,
    line: id => `<svg viewBox="4 8 248 218"><defs><mask id="${id}"><rect x="0" y="0" width="256" height="256" fill="#fff"/><path d="${HEAD}" fill="#000"/></mask></defs>
      <g fill="none" ${stroke('currentColor', 7)}>
        <g mask="url(#${id})">${both(`<path d="${ANTLER}"/><path d="${EAR}"/><path d="${EAR_IN}" stroke-width="4"/>`)}</g>
        <path d="${HEAD}"/><path d="${MUZZLE}" stroke-width="4"/><path d="${MOUTH}" stroke-width="4"/></g>
        <g fill="currentColor">${both(eyeShape('currentColor'))}<path d="${NOSE}"/></g></svg>`,
  };

  for (const el of document.querySelectorAll('[data-deer]')) {
    el.innerHTML = svgs[el.dataset.deer](`deer-${n++}`);
    el.firstElementChild.setAttribute('width', '100%');
    el.firstElementChild.setAttribute('height', '100%');
  }
})();
