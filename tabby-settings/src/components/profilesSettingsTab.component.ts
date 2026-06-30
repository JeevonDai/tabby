import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import deepClone from 'clone-deep'
import { ChangeDetectorRef, Component, Inject } from '@angular/core'
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { interval } from 'rxjs'
import { AppService, BaseTabComponent, ConfigService, HostAppService, Profile, SelectorService, ProfilesService, PromptModalComponent, PlatformService, BaseComponent, PartialProfile, ProfileProvider, TranslateService, Platform, ProfileGroup, PartialProfileGroup, QuickConnectProfileProvider, NotificationsService, MenuItemOptions, SplitTabComponent } from 'tabby-core'
import { EditProfileModalComponent } from './editProfileModal.component'
import { EditProfileGroupModalComponent, EditProfileGroupModalComponentResult } from './editProfileGroupModal.component'
import { SettingsNavigationService } from '../services/settingsNavigation.service'

_('Filter')
_('Ungrouped')
_('New SSH connection')
_('New Telnet connection')
_('New Serial connection')
_('New raw socket connection')
_('Cannot edit profile: connection plugin for "{type}" is not available')
_('No template found for {type}')
_('All groups')
_('Connections')
_('Group')
_('Host')
_('host or host:port')
_('user@host or user@host:port')
_('COM port')
_('No profiles found')
_('Detailed edit')
_('COM')
_('COM / host:port / user@host:port')
_('Password for {user}@{host}')
_('Invalid connection address: {message}')

interface CollapsableProfileGroup extends ProfileGroup {
    collapsed: boolean
    children: PartialProfileGroup<CollapsableProfileGroup>[]
}

interface ConnectionGroupSection {
    id: string
    name: string
    profiles: PartialProfile<Profile>[]
    textColor: string|null
}

type ConnectionLaunchState = 'none' | 'connected' | 'disconnected'

interface ConnectableTabLike extends BaseTabComponent {
    profile?: { id?: string }
    session?: { open?: boolean } | null
    reconnect (): Promise<void>
}

/** @hidden */
@Component({
    templateUrl: './profilesSettingsTab.component.pug',
    styleUrls: ['./profilesSettingsTab.component.scss'],
})
export class ProfilesSettingsTabComponent extends BaseComponent {
    private static readonly CLEAR_UNGROUPED_KEY = 'tabby.connections.clearedUngrouped'

    builtinProfiles: PartialProfile<Profile>[] = []
    profiles: PartialProfile<Profile>[] = []
    templateProfiles: PartialProfile<Profile>[] = []
    customProfiles: PartialProfile<Profile>[] = []
    profileGroups: PartialProfileGroup<CollapsableProfileGroup>[]
    rootGroups: PartialProfileGroup<CollapsableProfileGroup>[] = []

    filter = ''
    connectionGroupFilter = 'all'
    activeProfilesSubTab = 'profiles'
    connectionGroupSections: ConnectionGroupSection[] = []
    connectionProfileGroups: PartialProfileGroup<ProfileGroup>[] = []
    connectionDrafts: Record<string, string> = {}
    Platform = Platform
    defaultSSHX11Display = this.hostApp.platform === Platform.Linux
        ? '/tmp/.X11-unix/X0'
        : 'localhost:0.0'
    private descriptionCache = new Map<string, string|null>()
    private connectionAddressCache = new Map<string, string>()

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        @Inject(ProfileProvider) public profileProviders: ProfileProvider<Profile>[],
        private profilesService: ProfilesService,
        private selector: SelectorService,
        private ngbModal: NgbModal,
        private platform: PlatformService,
        private translate: TranslateService,
        private notifications: NotificationsService,
        private app: AppService,
        private changeDetector: ChangeDetectorRef,
        private settingsNavigation: SettingsNavigationService,
    ) {
        super()
        this.profileProviders.sort((a, b) => a.name.localeCompare(b.name))
    }

    get hasSSHProvider (): boolean {
        return this.profileProviders.some(p => p.id === 'ssh')
    }

    async ngOnInit (): Promise<void> {
        await this.refreshProfileGroups()
        await this.refreshProfiles()
        await this.maybeClearUngroupedConnections()
        this.subscribeUntilDestroyed(this.config.changed$, () => this.refreshProfileGroups())
        this.subscribeUntilDestroyed(this.config.changed$, () => this.refreshProfiles())
        this.subscribeUntilDestroyed(this.profilesService.pendingProfileCreation$, type => {
            void this.newProfileFromType(type)
        })
        const pending = this.profilesService.consumePendingNewProfileRequest()
        if (pending) {
            await this.newProfileFromType(pending.type, pending.templateId)
        }
        const pendingProfilesSubTab = this.settingsNavigation.consumePendingProfilesSubTab()
        if (pendingProfilesSubTab) {
            this.activeProfilesSubTab = pendingProfilesSubTab
        }
        this.subscribeUntilDestroyed(this.settingsNavigation.profilesSubTabRequest$, subTab => {
            this.activeProfilesSubTab = subTab
        })
        this.subscribeUntilDestroyed(this.app.tabsChanged$, () => this.refreshConnectionLaunchStates())
        this.subscribeUntilDestroyed(interval(1000), () => {
            if (this.activeProfilesSubTab === 'connections') {
                this.refreshConnectionLaunchStates()
            }
        })
    }

    private refreshConnectionLaunchStates (): void {
        this.changeDetector.markForCheck()
    }

    async refreshProfiles (): Promise<void> {
        const allProfiles = await this.profilesService.getProfiles()
        this.builtinProfiles = allProfiles.filter(x => x.isBuiltin && !x.isTemplate)
        this.templateProfiles = allProfiles.filter(x => x.isBuiltin && x.isTemplate)
        this.customProfiles = allProfiles.filter(x => !x.isBuiltin)

        this.descriptionCache.clear()
        for (const p of allProfiles) {
            if (p.id) {
                this.descriptionCache.set(p.id, this.profilesService.getDescription(p))
            }
        }
        this.refreshConnectionGroupSections()
    }

    onConnectionGroupFilterChange (value: string): void {
        this.connectionGroupFilter = value
        if (this.connectionGroupFilter !== 'all' && !this.connectionDrafts[this.connectionGroupFilter]) {
            this.connectionDrafts[this.connectionGroupFilter] = ''
        }
        this.refreshConnectionGroupSections()
    }

    launchProfile (profile: PartialProfile<Profile>): void {
        void this.launchProfileAsync(profile)
    }

    getConnectionLaunchState (profile: PartialProfile<Profile>): ConnectionLaunchState {
        if (!profile.id) {
            return 'none'
        }
        const tab = this.findConnectableTabForProfile(profile.id)
        if (!tab) {
            return 'none'
        }
        return tab.session?.open ? 'connected' : 'disconnected'
    }

    getConnectionLaunchIconClass (profile: PartialProfile<Profile>): string {
        const state = this.getConnectionLaunchState(profile)
        if (state === 'connected') {
            return 'text-success'
        }
        if (state === 'disconnected') {
            return 'text-danger'
        }
        return 'text-muted'
    }

    private findConnectableTabForProfile (profileId: string): ConnectableTabLike | null {
        for (const topTab of this.app.tabs) {
            const childTabs = topTab instanceof SplitTabComponent
                ? topTab.getAllTabs()
                : [topTab]
            for (const tab of childTabs) {
                const candidate = tab as ConnectableTabLike
                if (candidate.profile?.id === profileId && typeof candidate.reconnect === 'function') {
                    return candidate
                }
            }
        }
        return null
    }

    private focusConnectableTab (tab: BaseTabComponent): void {
        const parentSplit = this.app.getParentTab(tab)
        if (parentSplit) {
            this.app.selectTab(parentSplit)
            parentSplit.focus(tab)
        } else {
            this.app.selectTab(tab)
        }
    }

    async launchProfileAsync (profile: PartialProfile<Profile>): Promise<void> {
        if (profile.id && this.connectionAddressCache.has(profile.id) && !await this.saveConnectionAddress(profile)) {
            return
        }
        if (profile.type === 'ssh' && this.sshNeedsPassword(profile)) {
            if (!await this.promptAndSaveSSHPassword(profile)) {
                return
            }
        }
        const tab = profile.id ? this.findConnectableTabForProfile(profile.id) : null
        const state = this.getConnectionLaunchState(profile)

        if (state === 'connected' && tab) {
            this.focusConnectableTab(tab)
            return
        }

        if (state === 'disconnected' && tab) {
            this.focusConnectableTab(tab)
            await tab.reconnect()
            return
        }

        this.profilesService.openNewTabForProfile(profile)
    }

    async newProfileFromType (type: string, templateId?: string): Promise<void> {
        const profiles = await this.profilesService.getProfiles()
        let base = templateId
            ? profiles.find(x => x.id === templateId)
            : profiles.find(x => x.type === type && x.isTemplate)
        if (!base) {
            base = profiles.find(x => x.type === type && x.isBuiltin)
        }
        if (!base) {
            this.notifications.error(this.translate.instant('No template found for {type}', { type }))
            return
        }
        await this.newProfile(base)
    }

    getConnectionProfileProviders (): ProfileProvider<Profile>[] {
        return this.profileProviders.filter(x => ['ssh', 'telnet', 'serial'].includes(x.id))
    }

    getTelnetTemplates (): PartialProfile<Profile>[] {
        return this.templateProfiles.filter(x => x.type === 'telnet')
    }

    getConnectionProfiles (): PartialProfile<Profile>[] {
        const profiles = this.getBaseConnectionProfiles()
        return profiles
            .filter(profile => this.isConnectionProfileVisible(profile))
            .sort((a, b) => this.getConnectionSortKey(a).localeCompare(this.getConnectionSortKey(b)))
    }

    refreshConnectionGroupSections (): void {
        this.connectionProfileGroups = this.getConnectionProfileGroups()

        let visibleGroups = this.connectionProfileGroups
        if (this.connectionGroupFilter === 'ungrouped') {
            visibleGroups = visibleGroups.filter(group => group.id === 'ungrouped')
        } else if (this.connectionGroupFilter !== 'all') {
            visibleGroups = visibleGroups.filter(group => group.id === this.connectionGroupFilter)
        }

        const profiles = this.getBaseConnectionProfiles()
            .filter(profile => this.isProfileVisible(profile))
            .sort((a, b) => a.name.localeCompare(b.name))

        this.connectionGroupSections = visibleGroups.map(group => ({
            id: group.id,
            name: group.name,
            profiles: profiles.filter(profile => (profile.group || 'ungrouped') === group.id),
            textColor: group.id === 'ungrouped' ? null : this.profilesService.getProfileGroupColor(group.id),
        }))
        for (const section of this.connectionGroupSections) {
            if (!this.connectionDrafts[section.id]) {
                this.connectionDrafts[section.id] = ''
            }
        }
    }

    getConnectionDraft (groupId: string): string {
        return this.connectionDrafts[groupId] ?? ''
    }

    setConnectionDraft (groupId: string, value: string): void {
        this.connectionDrafts[groupId] = value
    }

    async saveConnectionDraft (groupId: string): Promise<void> {
        const raw = this.connectionDrafts[groupId]?.trim()
        if (!raw) {
            return
        }
        if (!await this.createConnectionProfileFromRaw(this.detectConnectionType(raw), raw, groupId)) {
            return
        }
        this.connectionDrafts[groupId] = ''
        await this.refreshProfiles()
        this.refreshConnectionGroupSections()
    }

    getConnectionDraftPlaceholder (): string {
        return this.translate.instant('COM / host:port / user@host:port')
    }

    async onConnectionProfileDropped (event: CdkDragDrop<PartialProfile<Profile>[]>, section: ConnectionGroupSection): Promise<void> {
        if (event.previousContainer === event.container) {
            if (event.previousIndex !== event.currentIndex) {
                moveItemInArray(event.container.data, event.previousIndex, event.currentIndex)
            }
            return
        }

        const profile = event.item.data as PartialProfile<Profile>
        profile.group = section.id === 'ungrouped' ? '' : section.id
        transferArrayItem(
            event.previousContainer.data,
            event.container.data,
            event.previousIndex,
            event.currentIndex,
        )
        await this.profilesService.writeProfile(profile)
        await this.config.save()
        this.refreshConnectionGroupSections()
    }

    getConnectionTypeIcon (profile: PartialProfile<Profile>): string {
        if (profile.type === 'ssh') {
            return 'desktop'
        }
        if (profile.type === 'telnet') {
            return 'network-wired'
        }
        return 'microchip'
    }

    getConnectionProfileGroups (): PartialProfileGroup<ProfileGroup>[] {
        const groups: PartialProfileGroup<ProfileGroup>[] = []
        const ungrouped = this.profileGroups.find(group => group.id === 'ungrouped')
        if (ungrouped) {
            groups.push({
                id: 'ungrouped',
                name: this.translate.instant('Ungrouped'),
            })
        }
        for (const group of this.profileGroups) {
            if (!group.editable || group.id === 'ungrouped') {
                continue
            }
            groups.push({
                id: group.id,
                name: group.name,
            })
        }
        return groups
    }

    async newConnectionProfileGroup (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.prompt = this.translate.instant('New group name')
        const result = await modal.result.catch(() => null)
        if (!result?.value.trim()) {
            return
        }

        const group: PartialProfileGroup<ProfileGroup> = { id: '', name: result.value.trim() }
        await this.profilesService.newProfileGroup(group)
        await this.config.save()
        this.onConnectionGroupFilterChange(group.id)
    }

    async duplicateConnectionProfile (profile: PartialProfile<Profile>): Promise<void> {
        const copy: PartialProfile<Profile> = deepClone(profile)
        delete copy.id
        copy.name = this.translate.instant('{name} copy', profile)
        copy.isBuiltin = false
        copy.isTemplate = false
        await this.profilesService.newProfile(copy)
        await this.config.save()
    }

    getConnectionAddress (profile: PartialProfile<Profile>): string {
        if (profile.id && this.connectionAddressCache.has(profile.id)) {
            return this.connectionAddressCache.get(profile.id)!
        }
        if (profile.type === 'ssh') {
            return this.formatSSHConnection(profile)
        }
        return this.formatConnectionAddress(profile)
    }

    getConnectionAddressPlaceholder (profile: PartialProfile<Profile>): string {
        if (profile.type === 'serial') {
            return this.translate.instant('COM port')
        }
        if (profile.type === 'ssh') {
            return this.translate.instant('user@host or user@host:port')
        }
        return this.translate.instant('host or host:port')
    }

    onConnectionAddressInput (profile: PartialProfile<Profile>, value: string): void {
        if (profile.id) {
            this.connectionAddressCache.set(profile.id, value)
        }
    }

    async saveConnectionAddress (profile: PartialProfile<Profile>): Promise<boolean> {
        const raw = profile.id
            ? (this.connectionAddressCache.get(profile.id) ?? this.getConnectionAddress(profile))
            : this.getConnectionAddress(profile)
        if (!raw.trim()) {
            return false
        }

        const detectedType = this.detectConnectionType(raw)
        if (detectedType !== profile.type) {
            const groupId = profile.group ? profile.group : 'ungrouped'
            const cachedId = profile.id
            await this.profilesService.deleteProfile(profile)
            await this.config.save()
            if (cachedId) {
                this.connectionAddressCache.delete(cachedId)
            }
            await this.createConnectionProfileFromRaw(detectedType, raw, groupId)
            await this.refreshProfiles()
            this.refreshConnectionGroupSections()
            return false
        }

        if (!this.tryApplyConnectionRaw(profile, raw)) {
            return false
        }
        if (profile.id) {
            this.connectionAddressCache.delete(profile.id)
        }
        await this.saveConnectionProfile(profile)
        if (profile.type === 'ssh' && this.sshNeedsPassword(profile)) {
            await this.promptAndSaveSSHPassword(profile)
        }
        return true
    }

    async setConnectionProfileGroup (profile: PartialProfile<Profile>, group: string): Promise<void> {
        profile.group = group === 'ungrouped' ? '' : group
        await this.saveConnectionProfile(profile)
        this.refreshConnectionGroupSections()
    }

    async saveConnectionProfile (profile: PartialProfile<Profile>): Promise<void> {
        profile.options ??= {}
        if (!profile.name) {
            const cfgProxy = this.profilesService.getConfigProxyForProfile(profile)
            profile.name = this.profilesService.providerForProfile(profile)?.getSuggestedName(cfgProxy) ?? profile.type
        }
        if (profile.options.port !== null && profile.options.port !== undefined && profile.type !== 'serial') {
            profile.options.port = Number(profile.options.port)
        }
        await this.profilesService.writeProfile(profile)
        await this.config.save()
    }

    showConnectionProfileContextMenu (event: MouseEvent, profile: PartialProfile<Profile>): void {
        event.preventDefault()
        event.stopPropagation()

        const menu: MenuItemOptions[] = [
            {
                label: this.translate.instant('Duplicate'),
                click: () => {
                    void this.duplicateConnectionProfile(profile)
                },
            },
            {
                label: this.translate.instant('Detailed edit'),
                click: () => {
                    void this.editProfile(profile)
                },
            },
            { type: 'separator' },
            {
                label: this.translate.instant('Delete'),
                click: () => {
                    void this.deleteProfile(profile)
                },
            },
        ]
        this.platform.popupContextMenu(menu, event)
    }

    getProfileGroupTextColor (profile: PartialProfile<Profile>): string|null {
        if (!profile.group) {
            return null
        }
        return this.profilesService.getProfileGroupColor(profile.group)
    }

    private formatConnectionAddress (profile: PartialProfile<Profile>): string {
        profile.options ??= {}
        if (profile.type === 'serial') {
            return profile.options.port ?? ''
        }
        const provider = this.profilesService.providerForProfile(profile)
        if (provider instanceof QuickConnectProfileProvider) {
            const fullProfile = this.profilesService.getConfigProxyForProfile(profile)
            return provider.intoQuickConnectString(fullProfile) ?? ''
        }
        return ''
    }

    private formatSSHConnection (profile: PartialProfile<Profile>): string {
        profile.options ??= {}
        const host = profile.options.host ?? ''
        if (!host) {
            return ''
        }
        let s = host
        const user = profile.options.user
        if (user) {
            s = `${user}@${s}`
        }
        const port = profile.options.port ?? 22
        if (port !== 22) {
            s = `${s}:${port}`
        }
        return s
    }

    private parseSSHConnection (query: string): { user?: string, host: string, port: number } {
        let user: string|undefined = undefined
        let host = query.trim()
        let port = 22
        if (!host) {
            return { host: '', port: 22 }
        }
        if (host.includes('@')) {
            const parts = host.split(/@/g)
            host = parts[parts.length - 1]
            user = parts.slice(0, parts.length - 1).join('@')
        }
        if (host.includes('[')) {
            port = parseInt(host.split(']')[1].substring(1), 10)
            host = host.split(']')[0].substring(1)
        } else if (host.includes(':')) {
            port = parseInt(host.split(/:/g).pop()!, 10)
            host = host.substring(0, host.lastIndexOf(':'))
        }
        if (!port || Number.isNaN(port)) {
            port = 22
        }
        return { user, host, port }
    }

    private applyConnectionRaw (profile: PartialProfile<Profile>, raw: string): void {
        profile.options ??= {}
        if (profile.type === 'serial') {
            profile.options.port = raw.trim()
        } else if (profile.type === 'ssh') {
            const { user, host, port } = this.parseSSHConnection(raw)
            profile.options.host = host
            profile.options.port = port
            if (user) {
                profile.options.user = user
            }
        } else {
            const provider = this.profilesService.providerForProfile(profile)
            if (!(provider instanceof QuickConnectProfileProvider)) {
                throw new Error(`Connection provider for ${profile.type} cannot parse addresses`)
            }
            const parsed = provider.quickConnect(raw)
            if (!parsed?.options?.host || parsed.options.port === null || parsed.options.port === undefined) {
                throw new Error(`Connection provider for ${profile.type} returned an invalid address`)
            }
            profile.options.host = parsed.options.host
            profile.options.port = parsed.options.port
        }
    }

    private tryApplyConnectionRaw (profile: PartialProfile<Profile>, raw: string): boolean {
        try {
            this.applyConnectionRaw(profile, raw)
            return true
        } catch (error) {
            this.notifications.error(this.translate.instant('Invalid connection address: {message}', {
                message: error instanceof Error ? error.message : String(error),
            }))
            return false
        }
    }

    private async createConnectionProfileFromRaw (type: string, raw: string, groupId: string): Promise<boolean> {
        const profiles = await this.profilesService.getProfiles()
        let base = profiles.find(x => x.type === type && x.isTemplate)
        if (!base) {
            base = profiles.find(x => x.type === type && x.isBuiltin)
        }
        if (!base) {
            this.notifications.error(this.translate.instant('No template found for {type}', { type }))
            return false
        }

        const profile: PartialProfile<Profile> = deepClone(base)
        delete profile.id
        profile.isBuiltin = false
        profile.isTemplate = false
        profile.group = groupId === 'ungrouped' ? '' : groupId
        profile.options ??= {}
        if (!this.tryApplyConnectionRaw(profile, raw)) {
            return false
        }

        await this.profilesService.newProfile(profile)
        const cfgProxy = this.profilesService.getConfigProxyForProfile(profile)
        profile.name = this.profilesService.providerForProfile(profile)?.getSuggestedName(cfgProxy) ?? profile.type
        if (profile.options.port !== null && profile.options.port !== undefined && profile.type !== 'serial') {
            profile.options.port = Number(profile.options.port)
        }
        await this.profilesService.writeProfile(profile)

        if (profile.type === 'ssh' && this.sshNeedsPassword(profile)) {
            await this.promptAndSaveSSHPassword(profile)
        }
        await this.config.save()
        return true
    }

    private detectConnectionType (raw: string): 'ssh' | 'telnet' | 'serial' {
        const value = raw.trim()
        if (value.includes('@')) {
            return 'ssh'
        }
        if (/^COM\d+$/i.test(value) || /^\\\\\.\\COM\d+$/i.test(value) || /^\/dev\/(tty|cu)/i.test(value)) {
            return 'serial'
        }
        return 'telnet'
    }

    private sshNeedsPassword (profile: PartialProfile<Profile>): boolean {
        if (profile.type !== 'ssh') {
            return false
        }
        profile.options ??= {}
        const auth = profile.options.auth
        if (auth === 'publicKey' || auth === 'agent' || auth === 'keyboard-interactive') {
            return false
        }
        if (profile.options.password) {
            return false
        }
        if ((profile.options.privateKeys?.length ?? 0) > 0) {
            return false
        }
        return Boolean(profile.options.host)
    }

    private async promptAndSaveSSHPassword (profile: PartialProfile<Profile>): Promise<boolean> {
        profile.options ??= {}
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.password = true
        modal.componentInstance.prompt = this.translate.instant(
            'Password for {user}@{host}',
            {
                user: profile.options.user ?? 'root',
                host: profile.options.host ?? '',
            },
        )
        const result = await modal.result.catch(() => null)
        if (!result?.value) {
            return false
        }
        profile.options.password = result.value
        profile.options.auth = 'password'
        await this.profilesService.writeProfile(profile)
        await this.config.save()
        return true
    }

    private async maybeClearUngroupedConnections (): Promise<void> {
        if (localStorage.getItem(ProfilesSettingsTabComponent.CLEAR_UNGROUPED_KEY)) {
            return
        }
        const ungrouped = this.getBaseConnectionProfiles().filter(profile => !profile.group)
        for (const profile of ungrouped) {
            await this.profilesService.deleteProfile(profile)
        }
        if (ungrouped.length > 0) {
            await this.config.save()
            await this.refreshProfiles()
        }
        localStorage.setItem(ProfilesSettingsTabComponent.CLEAR_UNGROUPED_KEY, '1')
    }

    private getBaseConnectionProfiles (): PartialProfile<Profile>[] {
        return this.customProfiles.filter(x => ['ssh', 'telnet', 'serial'].includes(x.type) && !x.isTemplate)
    }

    private isConnectionProfileVisible (profile: PartialProfile<Profile>): boolean {
        if (this.connectionGroupFilter === 'ungrouped' && profile.group) {
            return false
        }
        if (this.connectionGroupFilter !== 'all' && this.connectionGroupFilter !== 'ungrouped' && profile.group !== this.connectionGroupFilter) {
            return false
        }
        return this.isProfileVisible(profile)
    }

    private getConnectionSortKey (profile: PartialProfile<Profile>): string {
        const groupName = profile.group ? this.profilesService.resolveProfileGroupName(profile.group) : ''
        return `${profile.group ? '1' : '0'}:${groupName}:${profile.name}`
    }

    async newProfile (base?: PartialProfile<Profile>): Promise<void> {
        if (!base) {
            let profiles = await this.profilesService.getProfiles()
            profiles = profiles.filter(x => !this.isProfileBlacklisted(x))
            base = await this.selector.show(
                this.translate.instant('Select a base profile to use as a template'),
                profiles.map(p => ({
                    icon: p.icon ?? undefined,
                    description: this.profilesService.getDescription(p) ?? undefined,
                    name: p.group ? `${this.profilesService.resolveProfileGroupName(p.group)} / ${p.name}` : p.name,
                    group: p.isTemplate ? this.translate.instant('Template') : this.translate.instant('Duplicate an existing profile'),
                    result: p,
                    weight: p.isTemplate ? 0 : 1,
                })),
            ).catch(() => undefined)
            if (!base) {
                return
            }
        }
        const baseProfile: PartialProfile<Profile> = deepClone(base)
        delete baseProfile.id
        if (base.isTemplate) {
            baseProfile.name = ''
        } else if (!base.isBuiltin) {
            baseProfile.name = this.translate.instant('{name} copy', base)
        }
        baseProfile.isBuiltin = false
        baseProfile.isTemplate = false
        const result = await this.showProfileEditModal(baseProfile)
        if (!result) {
            return
        }
        if (!result.name) {
            const cfgProxy = this.profilesService.getConfigProxyForProfile(result)
            result.name = this.profilesService.providerForProfile(result)?.getSuggestedName(cfgProxy) ?? this.translate.instant('{name} copy', base)
        }
        await this.profilesService.newProfile(result)
        await this.config.save()
    }

    async editProfile (profile: PartialProfile<Profile>): Promise<void> {
        const result = await this.showProfileEditModal(profile)
        if (!result) {
            return
        }
        await this.profilesService.writeProfile(result)
        await this.config.save()
    }

    async showProfileEditModal (profile: PartialProfile<Profile>): Promise<PartialProfile<Profile>|null> {
        const modal = this.ngbModal.open(
            EditProfileModalComponent,
            { size: 'lg' },
        )
        const provider = this.profilesService.providerForProfile(profile)
        if (!provider) {
            this.notifications.error(this.translate.instant('Cannot edit profile: connection plugin for "{type}" is not available', { type: profile.type }))
            return null
        }
        modal.componentInstance.partialProfile = deepClone(profile)
        modal.componentInstance.profileProvider = provider

        const result = await modal.result.catch(() => null)
        if (!result) {
            return null
        }

        result.type = provider.id
        return result
    }

    async deleteProfile (profile: PartialProfile<Profile>): Promise<void> {
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Delete "{name}"?', profile),
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response === 0) {
            await this.profilesService.deleteProfile(profile)
            await this.config.save()
            this.refreshConnectionGroupSections()
        }
    }

    async newProfileGroup (): Promise<void> {
        this.editProfileGroup({
            id: 'new',
            name: '',
            icon: 'far fa-folder',
        })
    }

    async editProfileGroup (group: PartialProfileGroup<CollapsableProfileGroup>): Promise<void> {
        const result = await this.showProfileGroupEditModal(group)
        if (!result) {
            return
        }

        await this.profilesService.writeProfileGroup(ProfilesSettingsTabComponent.collapsableIntoPartialProfileGroup(result))
        await this.config.save()
    }

    async showProfileGroupEditModal (group: PartialProfileGroup<CollapsableProfileGroup>): Promise<PartialProfileGroup<CollapsableProfileGroup>|null> {
        const modal = this.ngbModal.open(
            EditProfileGroupModalComponent,
            { size: 'lg' },
        )

        modal.componentInstance.group = deepClone(group)
        modal.componentInstance.providers = this.profileProviders

        const result: EditProfileGroupModalComponentResult<CollapsableProfileGroup> | null = await modal.result.catch(() => null)
        if (!result) {
            return null
        }

        if (result.provider) {
            return this.editProfileGroupDefaults(result.group, result.provider)
        }

        return result.group
    }

    private async editProfileGroupDefaults (group: PartialProfileGroup<CollapsableProfileGroup>, provider: ProfileProvider<Profile>): Promise<PartialProfileGroup<CollapsableProfileGroup>|null> {
        const modal = this.ngbModal.open(
            EditProfileModalComponent,
            { size: 'lg' },
        )
        const model = group.defaults?.[provider.id] ?? {}
        model.type = provider.id
        modal.componentInstance.partialProfile = Object.assign({}, model)
        modal.componentInstance.profileProvider = provider
        modal.componentInstance.defaultsMode = 'group'

        const result = await modal.result.catch(() => null)
        if (result) {
            // Fully replace the config
            for (const k in model) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete model[k]
            }
            Object.assign(model, result)
            if (!group.defaults) {
                group.defaults = {}
            }
            group.defaults[provider.id] = model
        }
        return this.showProfileGroupEditModal(group)
    }

    async deleteProfileGroup (group: PartialProfileGroup<ProfileGroup>): Promise<void> {
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Delete "{name}"?', group),
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response === 0) {
            let deleteProfiles = false
            if ((group.profiles?.length ?? 0) > 0 && (await this.platform.showMessageBox(
                {
                    type: 'warning',
                    message: this.translate.instant('Delete the group\'s profiles?'),
                    buttons: [
                        this.translate.instant('Move to "Ungrouped"'),
                        this.translate.instant('Delete'),
                    ],
                    defaultId: 0,
                    cancelId: 0,
                },
            )).response !== 0) {
                deleteProfiles = true
            }

            await this.profilesService.deleteProfileGroup(group, { deleteProfiles })
            await this.config.save()
        }
    }

    async refreshProfileGroups (): Promise<void> {
        const profileGroupCollapsed = JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')
        const groups = await this.profilesService.getProfileGroups({ includeNonUserGroup: true, includeProfiles: true })
        groups.sort((a, b) => a.name.localeCompare(b.name))
        groups.sort((a, b) => (a.id === 'built-in' || !a.editable ? 1 : 0) - (b.id === 'built-in' || !b.editable ? 1 : 0))
        groups.sort((a, b) => (a.id === 'ungrouped' ? 0 : 1) - (b.id === 'ungrouped' ? 0 : 1))
        this.profileGroups = groups.map(g => ProfilesSettingsTabComponent.intoPartialCollapsableProfileGroup(g, profileGroupCollapsed[g.id] ?? false))
        this.rootGroups = this.profilesService.buildGroupTree(this.profileGroups)
    }

    isGroupVisible (group: PartialProfileGroup<ProfileGroup>): boolean {
        return !this.filter || (group.profiles ?? []).some(x => this.isProfileVisible(x))
    }

    isProfileVisible (profile: PartialProfile<Profile>): boolean {
        return !this.filter || (profile.name + '$' + (this.getDescription(profile) ?? '')).toLowerCase().includes(this.filter.toLowerCase())
    }

    getDescription (profile: PartialProfile<Profile>): string|null {
        if (profile.id) {
            return this.descriptionCache.get(profile.id) ?? null
        }
        return this.profilesService.getDescription(profile)
    }

    getTypeLabel (profile: PartialProfile<Profile>): string {
        const name = this.profilesService.providerForProfile(profile)?.name
        if (name === 'Local terminal') {
            return ''
        }
        return name ? this.translate.instant(name) : this.translate.instant('Unknown')
    }

    getTypeColorClass (profile: PartialProfile<Profile>): string {
        return {
            ssh: 'secondary',
            serial: 'success',
            telnet: 'info',
            'split-layout': 'primary',
        }[this.profilesService.providerForProfile(profile)?.id ?? ''] ?? 'warning'
    }

    toggleGroupCollapse (group: PartialProfileGroup<CollapsableProfileGroup>): void {
        group.collapsed = !group.collapsed
        this.saveProfileGroupCollapse(group)
    }

    async editDefaults (provider: ProfileProvider<Profile>): Promise<void> {
        const modal = this.ngbModal.open(
            EditProfileModalComponent,
            { size: 'lg' },
        )
        const model = this.profilesService.getProviderDefaults(provider)
        model.type = provider.id
        modal.componentInstance.partialProfile = Object.assign({}, model)
        modal.componentInstance.profileProvider = provider
        modal.componentInstance.defaultsMode = 'enabled'
        const result = await modal.result.catch(() => null)
        if (result) {
            // Fully replace the config
            for (const k in model) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete model[k]
            }
            Object.assign(model, result)
            this.profilesService.setProviderDefaults(provider, model)
            await this.config.save()
        }
    }

    async deleteDefaults (provider: ProfileProvider<Profile>): Promise<void> {
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Restore settings to defaults ?'),
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response === 0) {
            this.profilesService.setProviderDefaults(provider, {})
            await this.config.save()
        }
    }

    blacklistProfile (profile: PartialProfile<Profile>): void {
        this.config.store.profileBlacklist = [...this.config.store.profileBlacklist, profile.id]
        this.config.save()
    }

    unblacklistProfile (profile: PartialProfile<Profile>): void {
        this.config.store.profileBlacklist = this.config.store.profileBlacklist.filter(x => x !== profile.id)
        this.config.save()
    }

    isProfileBlacklisted (profile: PartialProfile<Profile>): boolean {
        return profile.id && this.config.store.profileBlacklist.includes(profile.id)
    }

    getQuickConnectProviders (): ProfileProvider<Profile>[] {
        return this.profileProviders.filter(x => x instanceof QuickConnectProfileProvider)
    }

    /**
    * Save ProfileGroup collapse state in localStorage
    */
    private saveProfileGroupCollapse (group: PartialProfileGroup<CollapsableProfileGroup>): void {
        const profileGroupCollapsed = JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')
        profileGroupCollapsed[group.id] = group.collapsed
        window.localStorage.profileGroupCollapsed = JSON.stringify(profileGroupCollapsed)
    }

    private static collapsableIntoPartialProfileGroup (group: PartialProfileGroup<CollapsableProfileGroup>): PartialProfileGroup<ProfileGroup> {
        const g: any = { ...group }
        delete g.collapsed
        delete g.children
        return g
    }

    private static intoPartialCollapsableProfileGroup (group: PartialProfileGroup<ProfileGroup>, collapsed: boolean): PartialProfileGroup<CollapsableProfileGroup> {
        const collapsableGroup = {
            ...group,
            collapsed,
        }
        return collapsableGroup
    }
}
