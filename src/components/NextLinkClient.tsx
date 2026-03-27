"use client";

import Link, { LinkProps } from "next/link";
import React from "react";

type NextLinkClientProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children: React.ReactNode;
  };

export default function NextLinkClient(props: NextLinkClientProps) {
  return <Link {...props} />;
}