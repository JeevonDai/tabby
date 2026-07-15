import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, Injector } from '@angular/core'
import { BaseTabComponent, TranslateService } from 'tabby-core'

/** @hidden */
@Component({
    selector: 'connections-tab',
    template: '<profiles-settings-tab initialSubTab="connections"></profiles-settings-tab>',
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
}
