import { Component, Input, ViewChild, ElementRef } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

/** @hidden */
@Component({
    templateUrl: './promptModal.component.pug',
})
export class PromptModalComponent {
    @Input() value: string
    @Input() prompt: string|undefined
    @Input() password: boolean
    @Input() remember: boolean
    @Input() showRememberCheckbox: boolean
    @Input() okLabel: string|undefined
    @Input() secondaryLabel: string|undefined
    @ViewChild('input') input: ElementRef

    constructor (
        private modalInstance: NgbActiveModal,
    ) { }

    ngOnInit (): void {
        setTimeout(() => {
            this.input.nativeElement.focus()
        })
    }

    ok (): void {
        this.modalInstance.close({
            value: this.value,
            remember: this.remember,
            action: 'ok',
        })
    }

    secondary (): void {
        this.modalInstance.close({
            value: this.value,
            remember: this.remember,
            action: 'secondary',
        })
    }

    cancel (): void {
        this.modalInstance.close(null)
    }
}
