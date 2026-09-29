// app/accounting/page.tsx
"use client";

import Link from "next/link";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

export default function AccountingPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  return (
    <ProtectedPage
      fallbackTitle="Accounting"
      allowedRoles={["admin", "billing", "dispatcher", "manager"]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1200, mx: "auto" }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography
                variant="h4"
                sx={{ fontWeight: 900, letterSpacing: "-0.035em" }}
              >
                Accounting
              </Typography>
              <Typography sx={{ mt: 0.5, color: "text.secondary" }}>
                Back-office accounting workflows inside DCFlow.
              </Typography>
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              <Card
                elevation={0}
                sx={{
                  borderRadius: 2,
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.24)}`,
                  backgroundColor: alpha(theme.palette.primary.main, 0.06),
                }}
              >
                <CardActionArea component={Link} href="/accounting/sales-tax">
                  <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          display: "grid",
                          placeItems: "center",
                          backgroundColor: alpha(
                            theme.palette.primary.main,
                            0.14,
                          ),
                          color: "primary.light",
                        }}
                      >
                        <ReceiptLongRoundedIcon />
                      </Box>

                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 850 }}>
                          Sales Tax
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ mt: 0.75, color: "text.secondary" }}
                        >
                          Monthly customer payment allocations, untaxed
                          purchases, use tax, reconciliation, and filing close.
                        </Typography>
                      </Box>

                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ color: "primary.light" }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          Open Sales Tax
                        </Typography>
                        <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
                      </Stack>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Box>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}
