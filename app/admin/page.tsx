// app/admin/page.tsx
"use client";

import Link from "next/link";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

type AdminToolCardProps = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  featured?: boolean;
};

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          fontSize: { xs: "1rem", md: "1.05rem" },
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </Typography>

      {subtitle ? (
        <Typography
          sx={{
            mt: 0.5,
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

function AdminToolCard({
  href,
  title,
  description,
  icon,
  featured = false,
}: AdminToolCardProps) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${
          featured
            ? alpha(theme.palette.primary.main, 0.22)
            : alpha("#FFFFFF", 0.08)
        }`,
        backgroundColor: featured
          ? alpha(theme.palette.primary.main, 0.08)
          : "background.paper",
      }}
    >
      <CardActionArea
        component={Link}
        href={href}
        sx={{
          height: "100%",
          borderRadius: 3,
          alignItems: "stretch",
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2, md: 2.25 },
            height: "100%",
            display: "flex",
            flexDirection: "column",
            "&:last-child": { pb: { xs: 2, md: 2.25 } },
          }}
        >
          <Stack spacing={1.5} sx={{ height: "100%" }}>
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="flex-start"
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    backgroundColor: featured
                      ? alpha(theme.palette.primary.main, 0.16)
                      : alpha(theme.palette.primary.main, 0.12),
                    color: theme.palette.primary.light,
                  }}
                >
                  {icon}
                </Box>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      lineHeight: 1.2,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {title}
                  </Typography>
                </Box>
              </Stack>

              <ArrowForwardRoundedIcon
                sx={{
                  fontSize: 18,
                  color: "text.secondary",
                  flexShrink: 0,
                  mt: 0.25,
                }}
              />
            </Stack>

            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                lineHeight: 1.55,
              }}
            >
              {description}
            </Typography>

            <Box sx={{ flex: 1 }} />

            <Typography
              variant="caption"
              sx={{
                color: featured ? "primary.light" : "text.secondary",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              Open tool
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function AdminHomePage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const operationsTools: AdminToolCardProps[] = [
    {
      href: "/admin/users",
      title: "Users",
      description:
        "Create and manage DCFlow users, roles, active status, and login access. This is where helper accounts and technician pairings should live.",
      icon: <ManageAccountsRoundedIcon sx={{ fontSize: 22 }} />,
      featured: true,
    },
    {
      href: "/admin/employee-profiles",
      title: "Employee Profiles",
      description:
        "Labor roles, pairing defaults, technician/helper relationships, payroll metadata, and employee-level settings.",
      icon: <BadgeRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/daily-crew-overrides",
      title: "Daily Crew Overrides",
      description:
        "Reassign a helper or apprentice to a different technician for a specific day without changing default pairing.",
      icon: <GroupsRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/unavailability",
      title: "Employee Unavailability",
      description:
        "Mark sick, PTO, or other blocked days that affect only that employee’s scheduling availability.",
      icon: <EventBusyRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/pto-override",
      title: "Admin PTO Override",
      description:
        "Create PTO or sick time for an employee directly when office staff need to enter it on their behalf.",
      icon: <BeachAccessRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/holidays",
      title: "Company Holidays",
      description:
        "Maintain the company holiday calendar used by scheduling, timesheets, and office display workflows.",
      icon: <CelebrationRoundedIcon sx={{ fontSize: 22 }} />,
    },
  ];

  const systemTools: AdminToolCardProps[] = [
    {
      href: "/admin/trips-sync",
      title: "Trips Sync",
      description:
        "Build or refresh Trips from scheduled service tickets and project stage scheduling data.",
      icon: <SyncRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/auto-suggest-sync",
      title: "Auto-Suggest Time Sync",
      description:
        "Admin utility for time suggestion testing, sync validation, and workflow experimentation.",
      icon: <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/qbo-employee-sync",
      title: "QBO Employee Sync",
      description:
        "Pull employees from QuickBooks into Firestore so payroll-linked employee data stays aligned.",
      icon: <AccountBalanceRoundedIcon sx={{ fontSize: 22 }} />,
    },
    {
      href: "/admin/qbo-link-users",
      title: "QBO Link Users",
      description:
        "Link DCFlow users to QuickBooks employees by email to support payroll and export workflows.",
      icon: <LinkRoundedIcon sx={{ fontSize: 22 }} />,
    },
  ];

  return (
    <ProtectedPage fallbackTitle="Admin" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={4}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", lg: "center" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    icon={<AdminPanelSettingsRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Admin"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                    }}
                  />
                </Stack>

                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.65rem", md: "2.1rem" },
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Admin tools
                </Typography>

                <Typography
                  sx={{
                    mt: 0.9,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 960,
                  }}
                >
                  Employee setup, crew structure, PTO controls, syncing utilities, and internal
                  operations tools for DCFlow.
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
                sx={{ width: { xs: "100%", lg: "auto" } }}
              >
                <Button
                  component={Link}
                  href="/admin/users"
                  variant="contained"
                  startIcon={<ManageAccountsRoundedIcon />}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Open Users
                </Button>

                <Button
                  component={Link}
                  href="/admin/employee-profiles"
                  variant="outlined"
                  startIcon={<BadgeRoundedIcon />}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Employee Profiles
                </Button>
              </Stack>
            </Stack>

            <Box>
              <SectionHeader
                title="People & operations"
                subtitle="Core staffing and workforce administration tools."
              />

              <Box
                sx={{
                  mt: 1.5,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 1.5,
                }}
              >
                {operationsTools.map((tool) => (
                  <AdminToolCard key={tool.href} {...tool} />
                ))}
              </Box>
            </Box>

            <Divider />

            <Box>
              <SectionHeader
                title="System & sync utilities"
                subtitle="Background operations, data sync helpers, and accounting connection tools."
              />

              <Box
                sx={{
                  mt: 1.5,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 1.5,
                }}
              >
                {systemTools.map((tool) => (
                  <AdminToolCard key={tool.href} {...tool} />
                ))}
              </Box>
            </Box>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}