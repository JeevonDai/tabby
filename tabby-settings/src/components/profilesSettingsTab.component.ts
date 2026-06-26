import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import deepClone from 'clone-deep'
import { Component, Inject } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { ConfigService, HostAppService, Profile, SelectorService, ProfilesService, PromptModalComponent, PlatformService, BaseComponent, PartialProfile, ProfileProvider, TranslateService, Platform, ProfileGroup, PartialProfileGroup, QuickConnectProfileProvider, NotificationsService, MenuItemOptions } from 'tabby-core'
import { EditProfileModalComponent } from './editProfileModal.component'
import { EditProfileGroupModalComponent, EditProfileGroupModalComponentResult } from './editProfileGroupModal.component'

_('Filter')
_('Ungrouped')
_('New SSH connection')
_('New Telnet connection')
_('New Serial connection')
_('New raw socket connection')
_('Cannot edit profile: connection plugin for "{type}" is not available')
_('No template found for {type}')
_('All groups')
_('Telnet connections')
_('Detailed edit')

interface CollapsableProfileGroup extends ProfileGroup {
    collapsed: boolean
    children: PartialProfileGroup<CollapsableProfileGroup>[]
}

/** @hidden */
@Component({
    templateUrl: './profilesSettingsTab.component.pug',
    styleUrls: ['./profilesSettingsTab.component.scss'],
})
export class ProfilesSettingsTabComponent extends BaseComponent {
    builtinProfiles: PartialProfile<Profile>[] = []
    profiles: PartialProfile<Profile>[] = []
    templateProfiles: PartialProfile<Profile>[] = []
    customProfiles: PartialProfile<Profile>[] = []
    profileGroups: PartialProfileGroup<CollapsableProfileGroup>[]
    rootGroups: PartialProfileGroup<CollapsableProfileGroup>[] = []

    filter = ''
    telnetGroupFilter = 'all'
    Platform = Platform
    defaultSSHX11Display = this.hostApp.platform === Platform.Linux
        ? '/tmp/.X11-unix/X0'
        : 'localhost:0.0'
    private descriptionCache = new Map<string, string|null>()

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
        this.subscribeUntilDestroyed(this.config.changed$, () => this.refreshProfileGroups())
        this.subscribeUntilDestroyed(this.config.changed$, () => this.refreshProfiles())
        this.subscribeUntilDestroyed(this.profilesService.pendingProfileCreation$, type => {
            void this.newProfileFromType(type)
        })
        const pending = this.profilesService.consumePendingNewProfileRequest()
        if (pending) {
            await this.newProfileFromType(pending.type, pending.templateId)
        }
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
    }

    launchProfile (profile: PartialProfile<Profile>): void {
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

    getTelnetProfiles (): PartialProfile<Profile>[] {
        const profiles = this.customProfiles.filter(x => x.type === 'telnet' && !x.isTemplate)
        return profiles
            .filter(profile => this.isTelnetProfileVisible(profile))
            .sort((a, b) => this.getTelnetSortKey(a).localeCompare(this.getTelnetSortKey(b)))
    }

    getTelnetProfileGroups (): PartialProfileGroup<ProfileGroup>[] {
        return this.profileGroups
            .filter(group => group.editable || group.id === 'ungrouped')
            .map(group => ({
                id: group.id,
                name: group.id === 'ungrouped' ? this.translate.instant('Ungrouped') : group.name,
            }))
    }

    async newTelnetProfile (): Promise<void> {
        const templates = this.getTelnetTemplates()
        const template = templates.find(x => x.id === 'telnet:template') ?? templates[0]
        const profile: PartialProfile<Profile> = template ? deepClone(template) : {
            type: 'telnet',
            name: '',
            options: {
                host: '',
                port: 23,
                inputMode: 'readline',
                outputNewlines: 'crlf',
            },
        }
        delete profile.id
        profile.name = profile.name && !profile.isTemplate ? profile.name : this.translate.instant('New Telnet connection')
        profile.group = this.telnetGroupFilter === 'all' || this.telnetGroupFilter === 'ungrouped' ? '' : this.telnetGroupFilter
        profile.isBuiltin = false
        profile.isTemplate = false
        profile.icon ??= 'fas fa-network-wired'
        profile.options ??= {}
        profile.options.host ??= ''
        profile.options.port ??= 23

        await this.profilesService.newProfile(profile)
        await this.config.save()
    }

    async duplicateTelnetProfile (profile: PartialProfile<Profile>): Promise<void> {
        const copy: PartialProfile<Profile> = deepClone(profile)
        delete copy.id
        copy.name = this.translate.instant('{name} copy', profile)
        copy.isBuiltin = false
        copy.isTemplate = false
        await this.profilesService.newProfile(copy)
        await this.config.save()
    }

    async newTelnetProfileGroup (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.prompt = this.translate.instant('New group name')
        const result = await modal.result.catch(() => null)
        if (!result?.value.trim()) {
            return
        }

        const group: PartialProfileGroup<ProfileGroup> = { id: '', name: result.value.trim() }
        await this.profilesService.newProfileGroup(group)
        await this.config.save()
        this.telnetGroupFilter = group.id
    }

    async saveTelnetProfile (profile: PartialProfile<Profile>): Promise<void> {
        profile.options ??= {}
        if (!profile.name) {
            const cfgProxy = this.profilesService.getConfigProxyForProfile(profile)
            profile.name = this.profilesService.providerForProfile(profile)?.getSuggestedName(cfgProxy) ?? this.translate.instant('New Telnet connection')
        }
        if (profile.options.port !== null && profile.options.port !== undefined) {
            profile.options.port = Number(profile.options.port)
        }
        await this.profilesService.writeProfile(profile)
        await this.config.save()
    }

    async setTelnetProfileGroup (profile: PartialProfile<Profile>, group: string): Promise<void> {
        profile.group = group === 'ungrouped' ? '' : group
        await this.saveTelnetProfile(profile)
    }

    showTelnetProfileContextMenu (event: MouseEvent, profile: PartialProfile<Profile>): void {
        event.preventDefault()
        event.stopPropagation()

        const menu: MenuItemOptions[] = [
            {
                label: this.translate.instant('Duplicate'),
                click: () => {
                    void this.duplicateTelnetProfile(profile)
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

    getTelnetGroupColor (groupId?: string): string|null {
        if (!groupId) {
            return null
        }
        const group = this.profileGroups.find(x => x.id === groupId)
        if (!group || group.id === 'ungrouped') {
            return null
        }
        return this.profilesService.getProfileGroupColor(group.id)
    }

    getTelnetProfileColor (profile: PartialProfile<Profile>): string|null {
        return profile.color ?? this.getTelnetGroupColor(profile.group) ?? null
    }

    private isTelnetProfileVisible (profile: PartialProfile<Profile>): boolean {
        if (this.telnetGroupFilter === 'ungrouped' && profile.group) {
            return false
        }
        if (this.telnetGroupFilter !== 'all' && this.telnetGroupFilter !== 'ungrouped' && profile.group !== this.telnetGroupFilter) {
            return false
        }
        return this.isProfileVisible(profile)
    }

    private getTelnetSortKey (profile: PartialProfile<Profile>): string {
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
