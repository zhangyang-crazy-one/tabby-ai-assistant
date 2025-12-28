import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// Tabby modules
import TabbyCoreModule, { ToolbarButtonProvider, ConfigProvider, HotkeyProvider } from 'tabby-core';
import TabbyTerminalModule from 'tabby-terminal';
import { SettingsTabProvider } from 'tabby-settings';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCoreModule,
        TabbyTerminalModule,
        NgbModule
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: (class {}), multi: true },
        { provide: SettingsTabProvider, useClass: (class {}), multi: true },
        { provide: ConfigProvider, useClass: (class {}), multi: true },
        { provide: HotkeyProvider, useClass: (class {}), multi: true }
    ],
    declarations: [],
    entryComponents: []
})
export default class AiAssistantModule {
    constructor() {
        console.log('AiAssistantModule initialized (minimal version)');
    }
}
