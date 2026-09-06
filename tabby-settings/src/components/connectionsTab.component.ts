import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, Injector } from '@angular/core'
import { BaseTabComponent, TranslateService } from 'tabby-core'

/** @hidden */
@Component({
    selector: 'connections-tab',
    template: '<div class="connections-tab-body" tabindex="0" [class.connections-layout-vertical]="connectionsLayout === \'vertical\'" (wheel)="onWheel($event)"><profiles-settings-tab initialSubTab="connections"></profiles-settings-tab></div>',
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

    get connectionsLayout (): 'horizontal'|'vertical' {
        return this.config.store.appearance?.connectionsLayout === 'vertical' ? 'vertical' : 'horizontal'
    }

    onWheel (event: WheelEvent): void {
        if (this.connectionsLayout === 'vertical') {
            return
        }
        const container = event.currentTarget as HTMLElement
        if (
            container.scrollWidth > container.clientWidth
            && !this.isInsideScrollableY(event.target as HTMLElement, container)
            && Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ) {
            container.scrollLeft += event.deltaY
            event.preventDefault()
        }
    }

    private isInsideScrollableY (element: HTMLElement|null, boundary: HTMLElement): boolean {
        while (element && element !== boundary) {
            const style = getComputedStyle(element)
            if (
                (style.overflowY === 'auto' || style.overflowY === 'scroll')
                && element.scrollHeight > element.clientHeight
            ) {
                return true
            }
            element = element.parentElement
        }
        return false
    }
}
