export default function Header() {
  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          [data-header="true"] {
            justify-content: center !important;
          }
        }
      `}</style>
      <div 
        data-header="true"
        style={{ 
          padding: '1.5rem 5%', 
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem'
        }}>
        <span style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--gold-primary)', fontStyle: 'italic', letterSpacing: '-2px' }}>EP</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: '900', letterSpacing: '1px', lineHeight: '1' }}>EL PEDRITO</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-gray)', letterSpacing: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <div style={{width: '20px', height: '1px', background: 'var(--gold-primary)'}}></div> HUB
          </span>
        </div>
      </div>
    </>
  );
}
