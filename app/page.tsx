// app/page.tsx
import NextLinkClient from "../src/components/NextLinkClient";
import {
  Box,
  Button,
  Card,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

export default function HomePage() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4 },
        backgroundColor: "background.default",
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          backgroundColor: "background.paper",
          boxShadow: "none",
        }}
      >
        <Stack spacing={2} sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography variant="h5">DCFlow</Typography>

          <Typography variant="body2" color="text.secondary">
            Foundation build is in progress.
          </Typography>

          <Box>
<Button component={NextLinkClient} href="/login" variant="contained">
              Go to login
            </Button>
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}