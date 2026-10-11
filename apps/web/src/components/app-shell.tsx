import type { Status } from "@mewte/shared";
import { useMutation } from "@tanstack/react-query";
import {
  BookOpenIcon,
  ChevronsUpDownIcon,
  CircleUserRoundIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  LogOutIcon,
  ScrollTextIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import { LogoMark } from "@/components/logo";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useErrorToast } from "@/lib/errors";
import { keys, queryClient } from "@/lib/queries";
import { THEMES, type Theme, setTheme, useTheme } from "@/lib/theme";

interface NavItem {
  to: string;
  labelKey: "dashboard" | "accounts" | "rules" | "history" | "runs" | "settings";
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "dashboard", icon: LayoutDashboardIcon },
  { to: "/accounts", labelKey: "accounts", icon: CircleUserRoundIcon },
  { to: "/rules", labelKey: "rules", icon: ListFilterIcon },
  { to: "/history", labelKey: "history", icon: HistoryIcon },
  { to: "/runs", labelKey: "runs", icon: ScrollTextIcon },
  { to: "/settings", labelKey: "settings", icon: SettingsIcon },
];

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

function Navigation() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("nav.navigation")}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
            <SidebarMenuItem key={to}>
              <SidebarMenuButton
                isActive={isActive(pathname, to)}
                render={<NavLink onClick={() => setOpenMobile(false)} to={to} />}
                tooltip={t(`nav.${labelKey}`)}
              >
                <Icon aria-hidden="true" />
                <span>{t(`nav.${labelKey}`)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserMenu({ username }: { username: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const onError = useErrorToast();
  const logout = useMutation({
    mutationFn: api.logout,
    onError,
    onSuccess: () => {
      // Marking the session as gone sends the app to the login page; signing in again drops the old data.
      queryClient.setQueryData<Status>(keys.status, (status) =>
        status ? { ...status, user: null } : status,
      );
    },
  });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger render={<SidebarMenuButton size="lg" />}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
              <UserRoundIcon aria-hidden="true" className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{username}</span>
              <span className="truncate text-muted-foreground text-xs">{t("nav.signedIn")}</span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="ms-auto" />
          </MenuTrigger>
          <MenuPopup align="start" className="min-w-52" side="top">
            <MenuGroup>
              <MenuGroupLabel>{t("theme.label")}</MenuGroupLabel>
              <MenuRadioGroup onValueChange={(value) => setTheme(value as Theme)} value={theme}>
                {THEMES.map((value) => (
                  <MenuRadioItem key={value} value={value}>
                    {t(`theme.${value}`)}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
            <MenuLinkItem href="/api/docs" rel="noreferrer" target="_blank">
              <BookOpenIcon aria-hidden="true" />
              {t("nav.apiDocs")}
            </MenuLinkItem>
            <MenuSeparator />
            <MenuItem onClick={() => logout.mutate()}>
              <LogOutIcon aria-hidden="true" />
              {t("nav.signOut")}
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function Brand() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className="font-heading font-semibold text-base group-data-[collapsible=icon]:hidden">
        {t("app.name")}
      </span>
    </div>
  );
}

export function AppShell({ username }: { username: string }) {
  const { t } = useTranslation();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 justify-center">
          <Brand />
        </SidebarHeader>
        <SidebarContent>
          <Navigation />
        </SidebarContent>
        <SidebarFooter>
          <UserMenu username={username} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:hidden">
          <SidebarTrigger aria-label={t("nav.toggleSidebar")} />
          <Brand />
        </header>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
