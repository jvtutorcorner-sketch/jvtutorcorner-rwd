"use client";

import React from "react";

type Props = {
  channelName?: string;
};

export default function AgoraWhiteboard(_props: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: "600px",
        border: "1px solid #ccc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div>Interactive whiteboard disabled</div>
    </div>
  );
}