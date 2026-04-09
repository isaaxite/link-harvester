import { resolve } from 'node:path';
import { LinkHarvester } from '../index';
import { DetectType, LinkTarget, LinkType } from '../src/types';

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
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .detect(DetectType.Accessible)
    .detect(DetectType.Accessible)
    .filter(it => !!it.accessible)
    .detect(DetectType.ExternalRefs)
    .detect(DetectType.ExternalRefs)
    .detect(DetectType.ExternalRefs)
    .detect(DetectType.ExternalRefs)
    .classify({
      externalRefs: it => !!it.externalRefs?.length,
      other: 'rest'
    });

  // f
  const ret3 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type));

  // cd
  const ret4 = await harvester().gather()
    .detect(DetectType.Accessible)
    .classify({
      accessible: it => !!it.accessible,
      invalid: it => it.accessible === false,
      other: 'rest'
    });

  // df
  const ret5 = await harvester().gather()
    .detect(DetectType.ExternalRefs)
    .detect(DetectType.ExternalRefs)
    .filterBy(LinkTarget.LocalResource)
    .filter(it => !it.externalRefs?.length);

  // fc
  const ret6 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .detect(DetectType.Accessible)
    .classify({
      accessible: it => !!it.accessible,
      other: 'rest'
    });

  // fd
  const ret7 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .detect(DetectType.ExternalRefs);

  // dfc
  const ret8 = await harvester().gather()
    .detect(DetectType.Accessible)
    .detect(DetectType.ExternalRefs)
    .filterBy(LinkTarget.LocalResource)
    .filter(it => !it.externalRefs?.length)
    .classify({
      accessible: it => !!it.accessible,
      other: 'rest'
    });

  // fcd
  const ret9 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .detect(DetectType.Accessible)
    .classify({
      accessible: it => !!it.accessible,
      other: 'rest'
    });
  
  // fcd
  const ret10 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .filter((item) => [
      LinkType.MarkdownImage,
      LinkType.HtmlImage,
    ].includes(item.type))
    .detect(DetectType.Accessible)
    .classify({
      accessible: it => !!it.accessible,
      other: 'rest'
    });

  // fdf
  const ret11 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .filter(it => !it.externalRefs?.length);

  // fdc
  const ret12 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .classify({
      externalRefs: it => !!it.externalRefs?.length
    });

  // fdfc
  const ret13 = await harvester().gather()
    .filterBy(LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .filter(it => !it.externalRefs?.length)
    .detect(DetectType.Accessible)
    .classify({
      accessible: it => !!it.accessible,
      other: 'rest'
    });

  process.exit(0);
}

main().catch(console.error);
