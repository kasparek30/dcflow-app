// src/theme/dcflowTheme.ts

import { alpha, createTheme } from "@mui/material/styles";

const dcBlue = "#0D7EF2";
const dcBlueLight = "#47B8FF";
const dcBlueDark = "#0A68C9";
const dcRed = "#FF2A36";

const dcBg = "#070A0F";
const dcSurface = "#11161F";
const dcSurfaceContainer = "#151C27";
const dcSurfaceContainerHigh = "#1A2230";

const dcBorder = "rgba(255,255,255,0.10)";
const dcBorderSoft = "rgba(255,255,255,0.08)";
const dcTextPrimary = "#FFFFFF";
const dcTextSecondary = "rgba(255,255,255,0.72)";
const dcTextMuted = "rgba(255,255,255,0.58)";

export const dcflowTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: dcBlue,
      light: dcBlueLight,
      dark: dcBlueDark,
      contrastText: "#061018",
    },
    secondary: {
      main: dcRed,
      contrastText: "#FFFFFF",
    },
    error: {
      main: dcRed,
    },
    warning: {
      main: "#F59E0B",
      contrastText: "#1A1200",
    },
    success: {
      main: "#22C55E",
      contrastText: "#04120A",
    },
    info: {
      main: dcBlueLight,
      contrastText: "#061018",
    },
    background: {
      default: dcBg,
      paper: dcSurface,
    },
    text: {
      primary: dcTextPrimary,
      secondary: dcTextSecondary,
    },
    divider: dcBorder,
  },

  shape: {
    borderRadius: 12,
  },

  typography: {
    fontFamily: ["Roboto", "Arial", "Helvetica", "sans-serif"].join(","),
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,

    h1: {
      fontSize: "3.5rem",
      lineHeight: 1.12,
      fontWeight: 400,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontSize: "2.8125rem",
      lineHeight: 1.16,
      fontWeight: 400,
      letterSpacing: 0,
    },
    h3: {
      fontSize: "2.25rem",
      lineHeight: 1.22,
      fontWeight: 400,
      letterSpacing: 0,
    },
    h4: {
      fontSize: "2rem",
      lineHeight: 1.25,
      fontWeight: 500,
      letterSpacing: 0,
    },
    h5: {
      fontSize: "1.5rem",
      lineHeight: 1.33,
      fontWeight: 500,
      letterSpacing: 0,
    },
    h6: {
      fontSize: "1.25rem",
      lineHeight: 1.4,
      fontWeight: 500,
      letterSpacing: 0,
    },
    subtitle1: {
      fontSize: "1rem",
      lineHeight: 1.5,
      fontWeight: 500,
      letterSpacing: "0.009em",
    },
    subtitle2: {
      fontSize: "0.875rem",
      lineHeight: 1.43,
      fontWeight: 500,
      letterSpacing: "0.007em",
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.5,
      fontWeight: 400,
      letterSpacing: "0.031em",
    },
    body2: {
      fontSize: "0.875rem",
      lineHeight: 1.43,
      fontWeight: 400,
      letterSpacing: "0.017em",
    },
    button: {
      textTransform: "none",
      fontSize: "0.875rem",
      lineHeight: 1.43,
      fontWeight: 500,
      letterSpacing: "0.007em",
    },
    caption: {
      fontSize: "0.75rem",
      lineHeight: 1.33,
      fontWeight: 400,
      letterSpacing: "0.033em",
      color: dcTextMuted,
    },
    overline: {
      fontSize: "0.75rem",
      lineHeight: 1.33,
      fontWeight: 500,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          height: "100%",
        },
        body: {
          minHeight: "100%",
          backgroundColor: dcBg,
          color: dcTextPrimary,
        },
        "*": {
          boxSizing: "border-box",
        },
        "::selection": {
          backgroundColor: alpha(dcBlueLight, 0.24),
          color: "#FFFFFF",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: dcBorder,
        },
        rounded: {
          borderRadius: 12,
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: dcSurfaceContainer,
          border: `1px solid ${dcBorder}`,
          boxShadow: "none",
          borderRadius: 12,
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: alpha(dcBg, 0.92),
          borderBottom: `1px solid ${dcBorderSoft}`,
          boxShadow: "none",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
          backgroundColor: dcSurface,
          borderRight: `1px solid ${dcBorderSoft}`,
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: dcBorderSoft,
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: 20,
          paddingLeft: 16,
          paddingRight: 16,
          boxShadow: "none",
        },
        contained: {
          boxShadow: "none",
        },
        containedPrimary: {
          color: "#061018",
          background: dcBlueLight,
          "&:hover": {
            background: "#63C3FF",
            boxShadow: "none",
          },
        },
        outlined: {
          borderWidth: 1,
          backgroundColor: "transparent",
        },
        outlinedPrimary: {
          borderColor: alpha(dcBlueLight, 0.32),
          color: dcTextPrimary,
          "&:hover": {
            borderColor: alpha(dcBlueLight, 0.48),
            backgroundColor: alpha(dcBlueLight, 0.08),
          },
        },
        text: {
          color: dcTextPrimary,
          "&:hover": {
            backgroundColor: alpha("#FFFFFF", 0.06),
          },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: alpha("#FFFFFF", 0.02),
          transition: "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
          "& fieldset": {
            borderColor: alpha("#FFFFFF", 0.14),
          },
          "&:hover fieldset": {
            borderColor: alpha("#FFFFFF", 0.22),
          },
          "&.Mui-focused": {
            backgroundColor: alpha(dcSurfaceContainerHigh, 0.96),
            boxShadow: `0 0 0 3px ${alpha(dcBlue, 0.18)}`,
          },
          "&.Mui-focused fieldset": {
            borderColor: dcBlueLight,
          },
          "&.Mui-error": {
            boxShadow: `0 0 0 3px ${alpha(dcRed, 0.14)}`,
          },
          "&.Mui-error fieldset": {
            borderColor: alpha(dcRed, 0.72),
          },
        },
        input: {
          color: dcTextPrimary,
          "&::placeholder": {
            color: alpha("#FFFFFF", 0.42),
            opacity: 1,
          },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: alpha("#FFFFFF", 0.72),
          fontWeight: 500,
        },
      },
    },

    MuiInputAdornment: {
      styleOverrides: {
        root: {
          color: dcTextSecondary,
        },
      },
    },

    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        fullWidth: true,
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          alignItems: "center",
          boxShadow: "none",
        },
        outlinedError: {
          backgroundColor: alpha(dcRed, 0.08),
          borderColor: alpha(dcRed, 0.24),
        },
        outlinedWarning: {
          backgroundColor: alpha("#F59E0B", 0.08),
          borderColor: alpha("#F59E0B", 0.22),
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
        label: {
          paddingLeft: 10,
          paddingRight: 10,
        },
      },
    },

    MuiList: {
      styleOverrides: {
        root: {
          paddingTop: 0,
          paddingBottom: 0,
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          marginInline: 6,
          marginBlock: 2,
          minHeight: 44,
          "&.Mui-selected": {
            backgroundColor: alpha(dcBlue, 0.14),
            color: "#FFFFFF",
          },
          "&.Mui-selected:hover": {
            backgroundColor: alpha(dcBlue, 0.18),
          },
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 36,
          color: dcTextSecondary,
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 700,
        },
      },
    },

    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderRadius: 20,
        },
      },
    },

    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          minWidth: 0,
          fontWeight: 500,
        },
        label: {
          fontSize: 12,
          fontWeight: 500,
        },
      },
    },

    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 64,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          backgroundImage: "none",
          backgroundColor: dcSurfaceContainerHigh,
          border: `1px solid ${dcBorder}`,
          boxShadow: "none",
        },
      },
    },

    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${dcBorder}`,
          backgroundColor: dcSurfaceContainer,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${dcBorderSoft}`,
        },
        head: {
          color: dcTextSecondary,
          fontWeight: 500,
          backgroundColor: alpha("#FFFFFF", 0.02),
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 999,
          backgroundColor: dcBlueLight,
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          textTransform: "none",
          fontWeight: 500,
          color: dcTextSecondary,
          "&.Mui-selected": {
            color: "#FFFFFF",
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          backgroundColor: alpha("#111827", 0.96),
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          fontSize: 12,
          fontWeight: 500,
        },
      },
    },
  },
});

export default dcflowTheme;