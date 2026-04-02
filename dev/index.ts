import { resolve } from 'node:path';
import { LinkHarvester } from '../index';
import { ClassifyType, LinkTarget, LinkType } from '../src/types';

async function main() {
  const base = resolve('../blog/source/_drafts/');
  const filePath = '英语学习/标注 | 局外人 | Pt. 1, Ch. 3.md';
  const harvester = () => new LinkHarvester({
    base,
    filePath,
  });

  const ret1 = await harvester().gather();

  const ret2 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type));

  const ret3 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .classifyBy(ClassifyType.IfAccessable);

  const ret4 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .classifyBy(ClassifyType.IfAccessable)
    .on('accessible')
    .detectExternalRefs();

  const ret5 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .classifyBy(ClassifyType.IfAccessable)
    .detectExternalRefs();

  process.exit(0);
}

main().catch(console.error);
