/** Default theme settings */
export const themeSettings: App.Theme.ThemeSetting = {
  themeScheme: 'dark',
  grayscale: false,
  colourWeakness: false,
  recommendColor: false,
  themeColor: 'rgb(109, 199, 238)',
  otherColor: { info: '#2080f0', success: '#52c41a', warning: '#faad14', error: '#f5222d' },
  isInfoFollowPrimary: true,
  resetCacheStrategy: 'close',
  layout: { mode: 'horizontal', scrollMode: 'content', reverseHorizontalMix: false },
  page: { animate: true, animateMode: 'fade-slide' },
  header: { height: 56, breadcrumb: { visible: true, showIcon: true } },
  tab: { visible: true, cache: true, height: 44, mode: 'chrome' },
  fixedHeaderAndTab: true,
  sider: {
    inverted: false,
    width: 300,
    collapsedWidth: 64,
    mixWidth: 90,
    mixCollapsedWidth: 64,
    mixChildMenuWidth: 200
  },
  footer: { visible: false, fixed: false, height: 48, right: true },
  watermark: { visible: false, text: 'SoybeanAdmin' },
  tokens: {
    light: {
      colors: {
        // container: 'rgb(255, 255, 255)',
        // layout: 'rgb(247, 250, 252)',
        container: 'rgb(72, 101, 115)',
        layout: 'rgb(50, 62, 79)',
        inverted: 'rgb(0, 20, 40)',
        'base-text': 'rgb(31, 31, 31)'
      },
      boxShadow: {
        header: '0 1px 2px rgb(0, 21, 41, 0.08)',
        sider: '2px 0 8px 0 rgb(29, 35, 41, 0.05)',
        tab: '0 1px 2px rgb(0, 21, 41, 0.08)'
      }
    },
    dark: { colors: { container: '#1a2b43', layout: 'rgb(50, 62, 79)', 'base-text': 'rgb(224, 224, 224)' } }
  }
};

/**
 * Override theme settings
 *
 * If publish new version, use `overrideThemeSettings` to override certain theme settings
 */
export const overrideThemeSettings: Partial<App.Theme.ThemeSetting> = {};
