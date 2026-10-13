/**
 * Aperture — Studio Application Initializer
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Aperture Studio...');

  // Initialize camera system
  await CameraManager.init();

  // Initialize scopes
  ScopeEngine.init();

  // Initialize director dialogue
  ChatManager.init();

  // Initialize frame analyzer
  AnalyzerManager.init();

  console.log('Aperture Studio ready.');
});
