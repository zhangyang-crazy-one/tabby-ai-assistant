import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { RiskLevel } from '../../types/security.types';

@Component({
    selector: 'app-consent-dialog',
    templateUrl: './consent-dialog.component.html',
    styleUrls: ['./consent-dialog.component.scss']
})
export class ConsentDialogComponent {
    @Input() command: string = '';
    @Input() riskLevel: RiskLevel = RiskLevel.MEDIUM;
    rememberChoice = false;

    constructor(public activeModal: NgbActiveModal) {}

    confirm(): void {
        this.activeModal.close({ confirmed: true, remember: this.rememberChoice });
    }

    cancel(): void {
        this.activeModal.dismiss('cancel');
    }
}
