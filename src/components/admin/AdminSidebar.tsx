'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from './AdminAuthProvider';
import { AdminBadge } from './AdminBadge';
import {
  LayoutDashboard,
  Building2,
  Building,
  MapPin,
  Tag,
  KeyRound,
  Sliders,
  FileCheck2,
  Image,
  Trees,
  HelpCircle,
  MessageSquare,
  Search,
  Sparkles,
  X,
  ShieldCheck,
  Users,
  BookOpen,
} from 'lucide-react';

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  capability?: string;
  comingSoon?: boolean;
  phaseBadge?: string;
}

interface SidebarGroup {
  groupLabel: string;
  items: SidebarItem[];
}

interface AdminSidebarProps {
  onCloseMobile?: () => void;
}

export function AdminSidebar({ onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();
  const { role, hasCapability } = useAdminAuth();

  const navigation: SidebarGroup[] = [
    {
      groupLabel: 'Overview',
      items: [
        {
          title: 'Dashboard',
          href: '/admin',
          icon: <LayoutDashboard className="h-4 w-4" />,
          capability: 'VIEW_DASHBOARD',
        },
      ],
    },
    {
      groupLabel: 'Properties / Discovery',
      items: [
        {
          title: 'Projects',
          href: '/admin/projects',
          icon: <Building2 className="h-4 w-4" />,
          capability: 'MANAGE_PROJECTS',
        },
        {
          title: 'Developers',
          href: '/admin/developers',
          icon: <Building className="h-4 w-4" />,
          capability: 'MANAGE_DEVELOPERS',
        },
        {
          title: 'Locations',
          href: '/admin/locations',
          icon: <MapPin className="h-4 w-4" />,
          capability: 'MANAGE_LOCATIONS',
        },
      ],
    },
    {
      groupLabel: 'Listings',
      items: [
        {
          title: 'Resale Listings',
          href: '/admin/listings/resale',
          icon: <Tag className="h-4 w-4" />,
          capability: 'MANAGE_RESALE',
        },
        {
          title: 'Rental Listings',
          href: '/admin/listings/rent',
          icon: <KeyRound className="h-4 w-4" />,
          capability: 'MANAGE_RENTAL',
        },
      ],
    },
    {
      groupLabel: 'Project Intelligence',
      items: [
        {
          title: 'Configurations',
          href: '/admin/intelligence/configurations',
          icon: <Sliders className="h-4 w-4" />,
          capability: 'MANAGE_CONFIGURATIONS',
        },
        {
          title: 'RERA Records',
          href: '/admin/intelligence/rera',
          icon: <FileCheck2 className="h-4 w-4" />,
          capability: 'MANAGE_RERA',
        },
        {
          title: 'Media Assets',
          href: '/admin/intelligence/media',
          icon: <Image className="h-4 w-4" />,
          capability: 'MANAGE_MEDIA',
        },
        {
          title: 'Amenities',
          href: '/admin/intelligence/amenities',
          icon: <Trees className="h-4 w-4" />,
          capability: 'MANAGE_PROJECTS',
        },
        {
          title: 'Project FAQs',
          href: '/admin/intelligence/faqs',
          icon: <HelpCircle className="h-4 w-4" />,
          capability: 'MANAGE_PROJECTS',
        },
      ],
    },
    {
      groupLabel: 'Operations',
      items: [
        {
          title: 'Visitor & Customer 360',
          href: '/admin/intelligence/customers',
          icon: <Users className="h-4 w-4" />,
          capability: 'customer_intelligence.read',
        },
        {
          title: 'Enquiries',
          href: '/admin/enquiries',
          icon: <MessageSquare className="h-4 w-4" />,
          capability: 'VIEW_ENQUIRIES',
        },
        {
          title: 'Site Visits',
          href: '/admin/site-visits',
          icon: <FileCheck2 className="h-4 w-4" />,
          capability: 'VIEW_ENQUIRIES',
        },
      ],
    },
    {
      groupLabel: 'Content / SEO Intelligence',
      items: [
        {
          title: 'SEO Overview',
          href: '/admin/seo/overview',
          icon: <LayoutDashboard className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Project SEO',
          href: '/admin/seo/projects',
          icon: <Search className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Developer SEO',
          href: '/admin/seo/developers',
          icon: <Sparkles className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Location SEO',
          href: '/admin/seo/locations',
          icon: <MapPin className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Resale & Rental SEO',
          href: '/admin/seo/listings',
          icon: <Tag className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Sitemap & Indexing',
          href: '/admin/seo/sitemap',
          icon: <FileCheck2 className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Search Console',
          href: '/admin/seo/search-console',
          icon: <Search className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
        {
          title: 'Insights & Guides',
          href: '/admin/content',
          icon: <BookOpen className="h-4 w-4" />,
          capability: 'MANAGE_SEO',
        },
      ],
    },
    {
      groupLabel: 'Administration',
      items: [
        {
          title: 'Staff & Roles',
          href: '/admin/staff',
          icon: <Users className="h-4 w-4" />,
          capability: 'staff.read',
        },
        {
          title: 'Audit Logs',
          href: '/admin/audit',
          icon: <ShieldCheck className="h-4 w-4" />,
          capability: 'audit.read',
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-[#111111] text-neutral-300 flex flex-col h-full shrink-0 border-r border-neutral-800 select-none">
      {/* Workspace Header */}
      <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between shrink-0">
        <Link
          href="/admin"
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 font-display text-white text-lg font-bold tracking-tight"
        >
          <div className="h-8 w-8 rounded-lg bg-terracotta flex items-center justify-center text-white font-bold text-sm">
            GH
          </div>
          <div className="flex flex-col">
            <span className="leading-tight">Great Homes</span>
            <span className="text-[10px] text-neutral-400 font-mono tracking-wider font-normal uppercase">
              Admin Workspace
            </span>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-neutral-400 hover:text-white p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 no-scrollbar">
        {navigation.map((group, groupIdx) => {
          // Filter items based on capability
          const visibleItems = group.items.filter(
            item => !item.capability || hasCapability(item.capability as any)
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={groupIdx} className="space-y-1">
              <h3 className="px-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest font-display">
                {group.groupLabel}
              </h3>
              <div className="space-y-0.5 mt-1">
                {visibleItems.map(item => {
                  const isActive =
                    item.href === '/admin'
                      ? pathname === '/admin'
                      : pathname?.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
                        isActive
                          ? 'bg-neutral-800 text-white font-semibold'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <span className={isActive ? 'text-terracotta' : 'text-neutral-400'}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.title}</span>
                      </div>
                      {item.phaseBadge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono border border-neutral-700">
                          {item.phaseBadge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Role Indicator */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white font-display">
                {role.replace('_', ' ')}
              </span>
              <span className="text-[10px] text-neutral-400">Authenticated Staff</span>
            </div>
          </div>
          <AdminBadge variant={role} size="sm" />
        </div>
      </div>
    </aside>
  );
}
