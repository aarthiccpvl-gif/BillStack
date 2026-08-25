import type { ComponentType } from 'react';
import type { BlockProps } from './blocks';
import { ClassicLayout, classicCss } from './layouts/ClassicLayout';
import { CorporateLayout, corporateCss } from './layouts/CorporateLayout';
import { ModernLayout, modernCss } from './layouts/ModernLayout';

/**
 * The template registry.
 *
 * Adding a fourth template is a new layout file plus one entry here — which is
 * what "the architecture must support adding additional templates later" means in
 * practice. `engineKey` on the database row selects the entry.
 */

export interface LayoutEntry {
  key: string;
  name: string;
  description: string;
  Layout: ComponentType<BlockProps>;
  css: string;
}

export const LAYOUTS: Record<string, LayoutEntry> = {
  corporate: {
    key: 'corporate',
    name: 'Corporate',
    description: 'Colour banner, logo left, metadata panel right. Dense and formal.',
    Layout: CorporateLayout,
    css: corporateCss,
  },
  modern: {
    key: 'modern',
    name: 'Modern',
    description: 'No banner. Large title, accent rule and generous whitespace.',
    Layout: ModernLayout,
    css: modernCss,
  },
  classic: {
    key: 'classic',
    name: 'Classic',
    description: 'Traditional ruled frame with a centred masthead. The familiar tax-invoice shape.',
    Layout: ClassicLayout,
    css: classicCss,
  },
};

export const getLayout = (engineKey: string): LayoutEntry =>
  LAYOUTS[engineKey] ?? (LAYOUTS.corporate as LayoutEntry);

export const layoutKeys = Object.keys(LAYOUTS);
