// Configuración del dashboard Fusion Restaurant Group.
// mode: 'live' usa /api/login y /api/data (Netlify Functions). Agrega ?demo=1 a la URL para ver datos de ejemplo.
window.FUSION_CONFIG = {
  mode: 'live',
  demoPassword: 'fusion2026',
  refreshMinutes: 10,
  brandOrder: ['ACAI', 'GONGCHA', 'Subway', 'Wingstop'],
  brands: {
    ACAI:     { label: 'ACAI',     color: '#5B0F6E', fcGoal: 36,   lcGoal: 16 },
    GONGCHA:  { label: 'GONGCHA',  color: '#C8102E', fcGoal: null, lcGoal: null },
    Subway:   { label: 'Subway',   color: '#E3C934', fcGoal: 31.5, lcGoal: 19 },
    Wingstop: { label: 'Wingstop', color: '#2DC937', fcGoal: 36,   lcGoal: 15 }
  },
  closedStores: ['Gong Cha Manati', 'Gong Cha San German', 'Gong Cha Guayama'],
  // En Pendientes solo se muestran estas tiendas para la marca indicada (coincidencia parcial)
  openOnly: { GONGCHA: ['Rexville'] }
};
