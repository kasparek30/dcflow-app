import NextLinkClient from "../src/components/NextLinkClient";
import { Box, Button, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

const LOGO_SRC = "/branding/dcflow-logo.png";
const SPLASH_BG_SRC = "/images/dcflow-home-truck.jpg";

export default function HomePage() {
  return (
    <Box
      component="main"
      sx={{
        position: "relative",
        minHeight: "100dvh",
        overflow: "clip",
        backgroundColor: "#EEF3FB",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: -24,
          backgroundImage: `url(${SPLASH_BG_SRC})`,
          backgroundSize: "cover",
          backgroundPosition: { xs: "center center", sm: "center 42%" },
          filter: "blur(10px)",
          transform: "scale(1.06)",
        }}
      />

      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background: `
            linear-gradient(
              180deg,
              ${alpha("#8AB4F8", 0.22)} 0%,
              ${alpha("#4F8DFD", 0.26)} 18%,
              ${alpha("#000000", 0.18)} 42%,
              ${alpha("#0F172A", 0.34)} 72%,
              ${alpha("#0F172A", 0.62)} 100%
            )
          `,
        }}
      />

      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(
              circle at 50% 12%,
              ${alpha("#FFFFFF", 0.22)} 0%,
              ${alpha("#FFFFFF", 0.08)} 22%,
              transparent 52%
            )
          `,
        }}
      />

      <Stack
        sx={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 460,
          minHeight: "100dvh",
          mx: "auto",
          px: { xs: 3, sm: 4 },
          pt: { xs: "max(28px, env(safe-area-inset-top))", sm: 5 },
          pb: { xs: "max(28px, env(safe-area-inset-bottom))", sm: 5 },
          textAlign: "center",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box
          component="img"
          src={LOGO_SRC}
          alt="DCFlow by Daniel Cernoch Plumbing"
          sx={{
            width: "100%",
            maxWidth: { xs: 300, sm: 340 },
            height: "auto",
            objectFit: "contain",
            mt: { xs: 1, sm: 2 },
            userSelect: "none",
            pointerEvents: "none",
            filter: "drop-shadow(0 4px 18px rgba(0, 0, 0, 0.18))",
          }}
        />

        <Stack
          spacing={2.25}
          sx={{
            width: "100%",
            alignItems: "center",
            my: "auto",
          }}
        >
          <Typography
            component="h1"
            sx={{
              maxWidth: 360,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              color: "#FFFFFF",
              fontSize: { xs: "3rem", sm: "3.5rem" },
              textShadow: "0 4px 20px rgba(0, 0, 0, 0.18)",
            }}
          >
            Ready for the day?
          </Typography>

          <Typography
            variant="body1"
            sx={{
              maxWidth: 360,
              color: alpha("#FFFFFF", 0.94),
              fontSize: { xs: "1.125rem", sm: "1.25rem" },
              lineHeight: 1.5,
              fontWeight: 400,
              textShadow: "0 2px 14px rgba(0, 0, 0, 0.16)",
            }}
          >
            Schedule, tickets, customers, and job history all in one place.
          </Typography>
        </Stack>

        <Box
          sx={{
            width: "100%",
            mt: 4,
          }}
        >
          <Button
            component={NextLinkClient}
            href="/login"
            variant="contained"
            fullWidth
            disableElevation
            sx={{
              minHeight: 64,
              borderRadius: 999,
              textTransform: "none",
              fontWeight: 700,
              fontSize: { xs: "1.5rem", sm: "1.625rem" },
              letterSpacing: "0.01em",
              color: "#FFFFFF",
              background: `linear-gradient(
                180deg,
                ${alpha("#5C97FF", 0.98)} 0%,
                #1A73E8 100%
              )`,
              border: `1px solid ${alpha("#FFFFFF", 0.22)}`,
              boxShadow: `
                0 10px 24px ${alpha("#174EA6", 0.34)},
                inset 0 1px 0 ${alpha("#FFFFFF", 0.28)}
              `,
              "&:hover": {
                background: `linear-gradient(
                  180deg,
                  #6AA2FF 0%,
                  #185ABC 100%
                )`,
                boxShadow: `
                  0 14px 32px ${alpha("#174EA6", 0.42)},
                  inset 0 1px 0 ${alpha("#FFFFFF", 0.22)}
                `,
              },
              "&:focus-visible": {
                outline: `3px solid ${alpha("#FFFFFF", 0.7)}`,
                outlineOffset: 4,
              },
            }}
          >
            Log in
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}