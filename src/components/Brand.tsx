// Signature MSBIM5D (Mourad SADOUN, ingénieur économiste, formateur) :
// logo complet et emblème, servis depuis public/marque/.

export const LOGO_URL = '/marque/msbim5d.png';
export const EMBLEM_URL = '/marque/msbim5d-embleme.png';
export const BRAND_TITLE = 'MSBIM5D — Mourad SADOUN, ingénieur économiste, formateur';

/** Logo complet (fond blanc), hauteur en px */
export function BrandLogo({ height, className }: { height: number; className?: string }) {
  return <img src={LOGO_URL} alt="MSBIM5D" title={BRAND_TITLE} height={height} className={`brand-logo${className ? ' ' + className : ''}`} draggable={false} />;
}

/** Emblème seul (« MS » en perspective), carré */
export function BrandEmblem({ size }: { size: number }) {
  return <img src={EMBLEM_URL} alt="" aria-hidden="true" width={size} height={size} className="brand-emblem" draggable={false} />;
}
