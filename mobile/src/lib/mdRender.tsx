// Lightweight cross-platform markdown → RN blocks renderer. Supports the
// common subset: # / ## / ### headings, bold **x**, italic *x*, inline `code`,
// [text](url) links, ![alt](url) images, > blockquotes, - and 1. lists,
// horizontal rules ---, and ```fenced``` code blocks. Not a full markdown
// spec — just enough for a great writing experience without adding a huge
// dependency.
import React from "react";
import { Linking, Platform, StyleSheet, Text, View, TextStyle } from "react-native";
import { colors, radii, spacing } from "@/src/theme";

type Inline = React.ReactNode;

// Inline formatter — handles bold/italic/code/links inside a single line.
function renderInline(line: string, base: TextStyle, keyPrefix: string): Inline[] {
  const nodes: Inline[] = [];
  // Master regex — order matters: images before links, code before emphasis.
  const re =
    /(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(line))) {
    if (match.index > last) {
      nodes.push(
        <Text key={`${keyPrefix}-t-${i++}`} style={base}>
          {line.slice(last, match.index)}
        </Text>,
      );
    }
    if (match[1]) {
      // Image is rendered as its alt text inline (block-level images handled separately)
      nodes.push(
        <Text key={`${keyPrefix}-img-${i++}`} style={[base, { fontStyle: "italic" }]}>
          {match[2] || "image"}
        </Text>,
      );
    } else if (match[4]) {
      const url = match[6];
      nodes.push(
        <Text
          key={`${keyPrefix}-a-${i++}`}
          style={[base, { color: colors.primary, textDecorationLine: "underline" }]}
          onPress={() => Linking.openURL(url).catch(() => {})}
        >
          {match[5]}
        </Text>,
      );
    } else if (match[7]) {
      nodes.push(
        <Text key={`${keyPrefix}-code-${i++}`} style={[base, styles.inlineCode]}>
          {match[8]}
        </Text>,
      );
    } else if (match[9]) {
      nodes.push(
        <Text key={`${keyPrefix}-b-${i++}`} style={[base, { fontWeight: "800" }]}>
          {match[10]}
        </Text>,
      );
    } else if (match[11]) {
      nodes.push(
        <Text key={`${keyPrefix}-i-${i++}`} style={[base, { fontStyle: "italic" }]}>
          {match[12]}
        </Text>,
      );
    }
    last = re.lastIndex;
  }
  if (last < line.length) {
    nodes.push(
      <Text key={`${keyPrefix}-tail-${i++}`} style={base}>
        {line.slice(last)}
      </Text>,
    );
  }
  return nodes;
}

function renderImageBlock(alt: string, url: string, key: string): React.ReactNode {
  if (Platform.OS === "web") {
    return (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      <img
        key={key}
        src={url}
        alt={alt}
        style={{
          width: "100%",
          borderRadius: 8,
          marginTop: 16,
          marginBottom: 16,
          objectFit: "cover",
        }}
      />
    );
  }
  const { Image } = require("react-native");
  return (
    <View key={key} style={styles.blockImageWrap}>
      <Image source={{ uri: url }} style={styles.blockImage} resizeMode="cover" />
      {!!alt && <Text style={styles.blockImageCaption}>{alt}</Text>}
    </View>
  );
}

export function renderMarkdownToBlocks(md: string): React.ReactNode[] {
  const lines = (md || "").split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    listBuffer = null;
    blocks.push(
      <View key={`list-${blocks.length}`} style={styles.list}>
        {items.map((it, idx) => (
          <View key={`li-${idx}`} style={styles.listItem}>
            <Text style={styles.listBullet}>{ordered ? `${idx + 1}.` : "•"}</Text>
            <Text style={styles.paragraph}>
              {renderInline(it, styles.paragraph, `li-${blocks.length}-${idx}`)}
            </Text>
          </View>
        ))}
      </View>,
    );
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    // Fenced code block
    if (line.startsWith("```")) {
      flushList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <View key={`code-${blocks.length}`} style={styles.codeBlock}>
          <Text style={styles.codeText}>{buf.join("\n")}</Text>
        </View>,
      );
      continue;
    }

    // Block image on its own line: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      flushList();
      blocks.push(renderImageBlock(imgMatch[1], imgMatch[2], `img-${blocks.length}`));
      i++;
      continue;
    }

    // Headings
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    if (h1) {
      flushList();
      blocks.push(
        <Text key={`h1-${blocks.length}`} style={styles.h1}>
          {renderInline(h1[1], styles.h1, `h1-${blocks.length}`)}
        </Text>,
      );
      i++;
      continue;
    }
    if (h2) {
      flushList();
      blocks.push(
        <Text key={`h2-${blocks.length}`} style={styles.h2}>
          {renderInline(h2[1], styles.h2, `h2-${blocks.length}`)}
        </Text>,
      );
      i++;
      continue;
    }
    if (h3) {
      flushList();
      blocks.push(
        <Text key={`h3-${blocks.length}`} style={styles.h3}>
          {renderInline(h3[1], styles.h3, `h3-${blocks.length}`)}
        </Text>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      flushList();
      blocks.push(
        <View key={`bq-${blocks.length}`} style={styles.blockquote}>
          <Text style={styles.blockquoteText}>
            {renderInline(line.replace(/^>\s?/, ""), styles.blockquoteText, `bq-${blocks.length}`)}
          </Text>
        </View>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line === "---" || line === "***") {
      flushList();
      blocks.push(<View key={`hr-${blocks.length}`} style={styles.hr} />);
      i++;
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(ul[1]);
      i++;
      continue;
    }
    // Ordered list
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(ol[1]);
      i++;
      continue;
    }

    // Blank line → flush list
    if (!line) {
      flushList();
      i++;
      continue;
    }

    // Regular paragraph — combine consecutive non-empty non-special lines
    flushList();
    const paraLines: string[] = [line];
    let j = i + 1;
    while (j < lines.length) {
      const nx = lines[j].trim();
      if (
        !nx ||
        /^(#{1,3})\s/.test(nx) ||
        /^[-*]\s/.test(nx) ||
        /^\d+\.\s/.test(nx) ||
        nx.startsWith(">") ||
        nx.startsWith("```") ||
        nx.startsWith("![")
      )
        break;
      paraLines.push(nx);
      j++;
    }
    const text = paraLines.join(" ");
    blocks.push(
      <Text key={`p-${blocks.length}`} style={styles.paragraph}>
        {renderInline(text, styles.paragraph, `p-${blocks.length}`)}
      </Text>,
    );
    i = j;
  }
  flushList();
  return blocks;
}

const styles = StyleSheet.create({
  h1: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  h2: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    marginTop: spacing.md,
    marginBottom: 4,
  },
  h3: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  paragraph: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 26,
    marginTop: 6,
    marginBottom: 6,
  },
  list: { marginVertical: 6 },
  listItem: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginVertical: 3 },
  listBullet: {
    color: colors.primary,
    fontWeight: "800",
    minWidth: 20,
    fontSize: 16,
    lineHeight: 26,
  },
  blockquote: {
    borderLeftColor: colors.primary,
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginVertical: 8,
  },
  blockquoteText: {
    color: colors.textSecondary,
    fontStyle: "italic",
    fontSize: 16,
    lineHeight: 26,
  },
  hr: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  inlineCode: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  codeBlock: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginVertical: 10,
    borderColor: colors.border,
    borderWidth: 1,
  },
  codeText: {
    color: colors.textPrimary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    lineHeight: 20,
  },
  blockImageWrap: { marginVertical: 12 },
  blockImage: { width: "100%", height: 200, borderRadius: radii.sm },
  blockImageCaption: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 6,
  },
});
