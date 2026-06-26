import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

/** @hidden */
@Injectable()
export class SettingsNavigationService {
    private pendingProfilesSubTab: string | null = null
    private profilesSubTabRequest = new Subject<string>()
    profilesSubTabRequest$ = this.profilesSubTabRequest.asObservable()

    requestProfilesSubTab (subTab: string): void {
        this.pendingProfilesSubTab = subTab
        this.profilesSubTabRequest.next(subTab)
    }

    consumePendingProfilesSubTab (): string | null {
        const subTab = this.pendingProfilesSubTab
        this.pendingProfilesSubTab = null
        return subTab
    }
}
