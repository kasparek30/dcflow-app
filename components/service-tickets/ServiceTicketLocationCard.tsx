"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ServiceTicketMapPreview from "./ServiceTicketMapPreview";
import {
  buildPreferredMapsHref,
  buildTelHref,
  detectAppleMapsPreference,
  formatServiceTicketAddress,
} from "../../src/lib/service-ticket-map";

type Props = {
  customerDisplayName?: string | null;
  customerHref?: string | null;
  serviceAddressLine1?: string | null;
  serviceAddressLine2?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  servicePostalCode?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  showEmail?: boolean;
  canEditServiceLocation?: boolean;
  editServiceLocationDisabled?: boolean;
  onEditServiceLocation?: () => void;
};

export default function ServiceTicketLocationCard({
  customerDisplayName,
  customerHref,
  serviceAddressLine1,
  serviceAddressLine2,
  serviceCity,
  serviceState,
  servicePostalCode,
  customerPhone,
  customerEmail,
  showEmail = false,
  canEditServiceLocation = false,
  editServiceLocationDisabled = false,
  onEditServiceLocation,
}: Props) {
  const theme = useTheme();
  const [preferAppleMaps, setPreferAppleMaps] = useState(false);

  useEffect(() => {
    setPreferAppleMaps(detectAppleMapsPreference());
  }, []);

  const mapsAddress = useMemo(
    () =>
      formatServiceTicketAddress({
        line1: serviceAddressLine1,
        line2: serviceAddressLine2,
        city: serviceCity,
        state: serviceState,
        postalCode: servicePostalCode,
      }),
    [
      serviceAddressLine1,
      serviceAddressLine2,
      serviceCity,
      serviceState,
      servicePostalCode,
    ]
  );

  const cleanCustomerName = String(customerDisplayName || "").trim();
  const cleanCustomerHref = String(customerHref || "").trim();
  const phoneHref = buildTelHref(customerPhone);
  const mapsHref = buildPreferredMapsHref(mapsAddress, preferAppleMaps);

  return (
    <Stack spacing={1.25} sx={{ minWidth: 0, maxWidth: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        spacing={1.25}
        sx={{ minWidth: 0, maxWidth: "100%" }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ minWidth: 0, flex: 1 }}
        >
          <PlaceOutlinedIcon
            color="primary"
            fontSize="small"
            sx={{ flexShrink: 0 }}
          />

          <Stack spacing={0.1} sx={{ minWidth: 0 }}>
            {cleanCustomerHref ? (
              <Stack
                component={Link}
                href={cleanCustomerHref}
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{
                  minWidth: 0,
                  maxWidth: "100%",
                  color: "primary.main",
                  textDecoration: "none",
                  width: "fit-content",
                  "&:hover": {
                    textDecoration: "underline",
                  },
                }}
              >
                <Typography
                  variant="h6"
                  fontWeight={900}
                  noWrap
                  sx={{
                    minWidth: 0,
                    maxWidth: "100%",
                    color: "inherit",
                  }}
                >
                  {cleanCustomerName || "Customer"}
                </Typography>

                <OpenInNewRoundedIcon
                  sx={{
                    fontSize: 16,
                    flexShrink: 0,
                    color: "primary.main",
                    opacity: 0.8,
                  }}
                />
              </Stack>
            ) : (
              <Typography
                variant="h6"
                fontWeight={800}
                noWrap
                sx={{ minWidth: 0, maxWidth: "100%" }}
              >
                {cleanCustomerName || "Customer"}
              </Typography>
            )}

            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={700}
              sx={{ lineHeight: 1.1 }}
            >
              Service Location
            </Typography>
          </Stack>
        </Stack>

        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          justifyContent={{ xs: "flex-start", sm: "flex-end" }}
          flexWrap="wrap"
          useFlexGap
          sx={{ minWidth: 0, flexShrink: 0 }}
        >
          {canEditServiceLocation && onEditServiceLocation ? (
            <Button
              variant="text"
              size="small"
              startIcon={<EditRoundedIcon fontSize="small" />}
              onClick={onEditServiceLocation}
              disabled={editServiceLocationDisabled}
              sx={{
                borderRadius: 999,
                color: "text.secondary",
                fontSize: "0.78rem",
                fontWeight: 800,
                minWidth: 0,
                px: 1,
                whiteSpace: "nowrap",
                textTransform: "none",
                "& .MuiButton-startIcon": {
                  mr: 0.5,
                },
                "&:hover": {
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              Edit Location
            </Button>
          ) : null}

          {phoneHref ? (
            <Button
              component="a"
              href={phoneHref}
              variant="text"
              size="small"
              startIcon={<PhoneOutlinedIcon />}
              sx={{
                borderRadius: 999,
                color: "text.primary",
                fontWeight: 800,
                minWidth: 0,
                px: 1,
                whiteSpace: "nowrap",
                bgcolor: alpha(theme.palette.background.paper, 0.35),
                border: `1px solid ${alpha(theme.palette.divider, 0.45)}`,
                "&:hover": {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  borderColor: alpha(theme.palette.primary.main, 0.35),
                },
              }}
            >
              {customerPhone}
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {mapsAddress ? (
        <ServiceTicketMapPreview
          customerName={customerDisplayName}
          mapsAddress={mapsAddress}
          mapsHref={mapsHref}
          preferAppleMaps={preferAppleMaps}
        />
      ) : (
        <Alert severity="info" variant="outlined">
          No service address available for this ticket.
        </Alert>
      )}

      {showEmail && customerEmail ? (
        <Button
          component="a"
          href={`mailto:${customerEmail}`}
          variant="text"
          size="small"
          startIcon={<AlternateEmailRoundedIcon />}
          sx={{
            alignSelf: "flex-start",
            borderRadius: 999,
            color: "text.secondary",
            fontWeight: 700,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textTransform: "none",
            "&:hover": {
              color: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.06),
            },
          }}
        >
          <Typography component="span" variant="body2" noWrap>
            {customerEmail}
          </Typography>
        </Button>
      ) : null}
    </Stack>
  );
}