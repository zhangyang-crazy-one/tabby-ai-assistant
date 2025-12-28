/**
 * Tabby AI Assistant Plugin - Main Entry Point
 *
 * This file serves as the main entry point for the Tabby AI Assistant plugin.
 * It initializes the Angular module and integrates with Tabby's plugin system.
 */

import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import AiAssistantModule from './index';

// Bootstrap the Angular application
platformBrowserDynamic()
    .bootstrapModule(AiAssistantModule)
    .catch(err => console.error('Error starting Tabby AI Assistant:', err));

export default AiAssistantModule;
