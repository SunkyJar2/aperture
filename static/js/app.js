/**
 * Aperture — Studio Application Initializer
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Aperture Studio...');

  // Initialize scopes, grading, framing guides, take reel, mobile link, chat, and analyzer immediately
  ScopeEngine.init();
  GradingEngine.init();
  GuidesManager.init();
  TakeReelManager.init();
  MobileLinkStudio.init();
  ChatManager.init();
  AnalyzerManager.init();

  // Initialize camera system asynchronously
  await CameraManager.init();

  console.log('Aperture Studio ready.');
});
