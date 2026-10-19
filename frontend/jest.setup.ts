import '@testing-library/jest-dom';

/**
 * La campana de `AppHeader` (spec 005 T012) consulta las notificaciones en toda pantalla con
 * sesión. En las pruebas que no la ejercitan, sus llamadas quedan pendientes para no salir a la
 * red. Las pruebas de la campana y del servicio cambian estos simulacros o usan `jest.unmock`.
 */
jest.mock('@/services/notifications', () => ({
  ...jest.requireActual('@/services/notifications'),
  listNotifications: jest.fn(() => new Promise(() => {})),
  getUnreadCount: jest.fn(() => new Promise(() => {})),
  markNotificationRead: jest.fn(() => new Promise(() => {})),
  markAllNotificationsRead: jest.fn(() => new Promise(() => {})),
}));
