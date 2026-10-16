import { Fragment } from "react";
import KeyboardLayout from "@/components/keyboard-layout";

// Live components a post can drop in with a paragraph of its own: ::name::
const EMBEDS: Record<string, () => JSX.Element> = {
  "keyboard-layout": KeyboardLayout,
};

const MARKER = /<p>::([a-z0-9-]+)::<\/p>/g;

export default function PostBody({
  html,
  className,
  as: Tag = "div",
}: {
  html: string;
  className?: string;
  as?: "div" | "article";
}) {
  const parts = html.split(MARKER); // [html, name, html, name, ...]
  if (parts.length === 1) {
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <Tag className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          return part ? <div key={i} className="contents" dangerouslySetInnerHTML={{ __html: part }} /> : null;
        }
        const Embed = EMBEDS[part];
        return <Fragment key={i}>{Embed ? <Embed /> : null}</Fragment>;
      })}
    </Tag>
  );
}
