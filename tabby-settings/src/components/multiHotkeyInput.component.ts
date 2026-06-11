import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { HotkeyInputModalComponent } from './hotkeyInputModal.component'
import { Hotkey } from 'tabby-core'

/** @hidden */
@Component({
    selector: 'multi-hotkey-input',
    templateUrl: './multiHotkeyInput.component.pug',
    styleUrls: ['./multiHotkeyInput.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiHotkeyInputComponent {
    @Input() hotkeys: Hotkey[] = []
    @Output() hotkeysChange = new EventEmitter()

    constructor (
        private ngbModal: NgbModal,
        private changeDetector: ChangeDetectorRef,
    ) { }

    ngOnChanges (): void {
        this.hotkeys = this.normalizeHotkeys(this.hotkeys)
        this.changeDetector.markForCheck()
    }

    editItem (index: number): void {
        this.ngbModal.open(HotkeyInputModalComponent).result.then((newStrokes: string[]) => {
            if (this.hotkeys[index]) {
                this.hotkeys = this.hotkeys.map((hotkey, i) =>
                    i === index ? { ...hotkey, strokes: newStrokes } : hotkey,
                )
                this.storeUpdatedHotkeys()
            }
        })
    }

    addItem (): void {
        this.ngbModal.open(HotkeyInputModalComponent).result.then((value: string[]) => {
            this.hotkeys = [...this.hotkeys, { strokes: value, isDuplicate: false }]
            this.storeUpdatedHotkeys()
        })
    }

    removeItem (index: number, event: Event): void {
        event.stopPropagation()
        event.preventDefault()
        this.hotkeys = this.hotkeys.filter((_, i) => i !== index)
        this.storeUpdatedHotkeys()
    }

    private normalizeHotkeys (hotkeys: Hotkey[]): Hotkey[] {
        return (hotkeys ?? []).map(hotkey =>
            typeof hotkey.strokes === 'string'
                ? { ...hotkey, strokes: [hotkey.strokes] }
                : { ...hotkey, strokes: [...hotkey.strokes] },
        )
    }

    private storeUpdatedHotkeys () {
        this.hotkeysChange.emit(this.hotkeys)
        this.changeDetector.markForCheck()
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    protected castAny = (x: any): any => x
}
