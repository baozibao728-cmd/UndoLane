export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    undo: 'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    play: 'm8 5 11 7-11 7z', arrow: 'M4 12h16m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
    clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    edit: 'm15 5 4 4M4 20l4-1L21 6l-4-4L4 15z',
    search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    close: 'm6 6 12 12M6 18 18 6', plus: 'M12 5v14M5 12h14',
    spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
    folder: 'M3 6h7l2 3h9v12H3z', info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.info} /></svg>;
}

// Original, local sample artwork. No remote image service or real asset upload is implied.
export function AssetArt({ index = 0 }: { index?: number }) {
  const colors = [['#e9eee4', '#c99766', '#faf2da', '#9d4240'], ['#ede5d9', '#71483c', '#f3e1c4', '#ad7544'], ['#eadfe2', '#d8a17c', '#fff2e8', '#934c4c']][index % 3];
  return <svg viewBox="0 0 440 245" role="img" aria-label={['Illustration of a strawberry layer cake', 'Illustration of a chocolate layer cake', 'Illustration of a berry cake'][index % 3]}>
    <rect width="440" height="245" fill={colors[0]} />
    <path d="M18 198q80-27 143 0t152 0 120 0" fill="none" stroke="#fff" strokeOpacity=".5" />
    <ellipse cx="230" cy="206" rx="133" ry="14" fill="#43392d" opacity=".08" />
    <ellipse cx="220" cy="197" rx="113" ry="24" fill="#f9f7ef" />
    <ellipse cx="220" cy="192" rx="94" ry="18" fill="#ddd9c9" />
    <path d="M144 108v73c0 31 151 31 151 0v-73" fill={colors[1]} />
    <path d="M144 139c25 25 126 25 151 0v12c-25 25-126 25-151 0z" fill={colors[2]} />
    <path d="M145 168c25 24 123 24 150 0v8c-27 24-125 24-150 0z" fill={colors[2]} opacity=".8" />
    <ellipse cx="220" cy="108" rx="76" ry="29" fill={colors[2]} />
    <path d="M145 110c5 12 12 9 14 20s13 14 15-1 8-4 13 2 12 0 16-8 11 1 20 4 24-2 31-6 12 9 19 10 10-11 19-16" fill="none" stroke={colors[2]} strokeWidth="9" />
    {index % 3 === 1 ? <g fill={colors[1]}><path d="m185 89 23-24 19 17-23 24z"/><path d="m229 90 19-25 20 19-20 25z"/><path d="m207 109 17-17 18 13-18 20z"/></g> : <g fill={colors[3]}>
      <path d="M181 88c-20-25 18-36 26-12 13-21 34-3 18 16-15 18-30 13-44-4" transform="translate(8 7) scale(.9)" />
      <ellipse cx="235" cy="90" rx="16" ry="18" transform="rotate(25 235 90)"/><ellipse cx="264" cy="106" rx="12" ry="14"/>
      <path d="m184 67 17 5-5-16 10 14 11-8-5 15" fill="#647850"/><path d="m225 76 10 4 11-8-3 13" fill="#647850"/>
    </g>}
    <path d="m327 156 20-43m-17 36 18-2m-12-11-8-13" stroke="#7d8767" strokeWidth="3" fill="none" />
    <ellipse cx="352" cy="203" rx="8" ry="5" fill={colors[3]} /><circle cx="98" cy="180" r="5" fill={colors[1]} />
    <text x="22" y="29" fontFamily="monospace" fontSize="9" letterSpacing="2" fill="#665f50">STUDIO COLLECTION / 0{index + 1}</text>
  </svg>;
}
