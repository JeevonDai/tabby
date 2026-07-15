import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, Injector } from '@angular/core'
import { BaseTabComponent, TranslateService } from 'tabby-core'

/** @hidden */
@Component({
    selector: 'connections-tab',
    template: '<div class="connections-tab-body" tabindex="0" (wheel)="onWheel($event)"><profiles-settings-tab initialSubTab="connections"></profiles-settings-tab></div>',
    styleUrls: ['./connectionsTab.component.scss'],
})
export class ConnectionsTabComponent extends BaseTabComponent {
    constructor (
        translate: TranslateService,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle(translate.instant(_('Connections')))
        this.icon = 'fas fa-network-wired'
    }

    onWheel (event: WheelEvent): void {
        const target = event.currentTarget as HTMLElement
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            target.scrollLeft += event.deltaY
            event.preventDefault()
        }
    }
}
