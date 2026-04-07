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

  // d
  const ret2 = await harvester().gather()
    .detectExternalRefs()
    .detectExternalRefs();

  // f
  const ret3 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type));

  // cd
  const ret4 = await harvester().gather()
    .classifyBy(ClassifyType.IfAccessable)
    .detectExternalRefs();


  // df
  const ret5 = await harvester().gather()
    .detectExternalRefs()
    .detectExternalRefs()
    .filterBy(LinkTarget.LocalResource)
    .filter(it => !it.externalRefs?.length);

  // fc
  const ret6 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .classifyBy(ClassifyType.IfAccessable);

  // fd
  const ret7 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detectExternalRefs()
    .detectExternalRefs();

  // dfc
  const ret8 = await harvester().gather()
    .detectExternalRefs()
    .detectExternalRefs()
    .filterBy(LinkTarget.LocalResource)
    .filter(it => !it.externalRefs?.length)
    .classifyBy(ClassifyType.IfAccessable)
    .on('accessible')
    .detectExternalRefs();

  // fcd
  const ret10 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .classifyBy(ClassifyType.IfAccessable)
    .detectExternalRefs();
  
  // fcd
  const ret11 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .classifyBy(ClassifyType.IfAccessable)
    .on('accessible')
    .detectExternalRefs();

  // fdf
  const ret12 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detectExternalRefs()
    .filter(it => !it.externalRefs?.length);

  // fdc
  const ret13 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detectExternalRefs()
    .classify({
      externalRefs: it => !!it.externalRefs?.length
    });

  // fdfc
  const ret14 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detectExternalRefs()
    .filter(it => !it.externalRefs?.length)
    .classifyBy(ClassifyType.IfAccessable);

  process.exit(0);
}

main().catch(console.error);
