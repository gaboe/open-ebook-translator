import JSZip from "jszip";
import { writeFileSync } from "fs";

const zip = new JSZip();

zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

zip.file(
  "META-INF/container.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
);

zip.file(
  "OEBPS/content.opf",
  `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">sample-epub-001</dc:identifier>
    <dc:title>The Time Machine (Excerpt)</dc:title>
    <dc:creator>H.G. Wells</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`
);

zip.file(
  "OEBPS/nav.xhtml",
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="chapter1.xhtml">Chapter I</a></li>
      <li><a href="chapter2.xhtml">Chapter II</a></li>
    </ol>
  </nav>
</body>
</html>`
);

zip.file(
  "OEBPS/chapter1.xhtml",
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter I</title></head>
<body>
  <h1>Chapter I</h1>

  <p>The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His pale grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire blazed brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses.</p>

  <p>Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere, when thought runs gracefully free of the trammels of precision. And he put it to us in this way — marking the points with a lean forefinger — as we sat and lazily admired his earnestness over this new paradox (as we thought it) and his fecundity.</p>

  <p>"You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted. The geometry, for instance, they taught you at school is founded on a misconception."</p>

  <p>"Is not that rather a large thing to expect us to begin upon?" said Filby, an argumentative person with red hair.</p>

  <p>"I do not mean to ask you to accept anything without reasonable ground for it. You will soon admit as much as I need from you. You know of course that a mathematical line, a line of thickness <em>nil</em>, has no real existence. They taught you that? Neither has a mathematical plane. These things are mere abstractions."</p>

  <p>"That is all right," said the Psychologist.</p>

  <p>"Nor, having only length, breadth, and thickness, can a cube have a real existence."</p>

  <p>"There I object," said Filby. "Of course a solid body may exist. All real things —"</p>

  <p>"So most people think. But wait a moment. Can an <em>instantaneous</em> cube exist?"</p>

  <p>"Don't follow you," said Filby.</p>

  <p>"Can a cube that does not last for any time at all, have a real existence?"</p>

  <p>Filby became pensive. "Clearly," the Time Traveller proceeded, "any real body must have extension in <em>four</em> directions: it must have Length, Breadth, Thickness, and — Duration."</p>
</body>
</html>`
);

zip.file(
  "OEBPS/chapter2.xhtml",
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter II</title></head>
<body>
  <h1>Chapter II</h1>

  <p>I think that at that time none of us quite believed in the Time Machine. The fact is, the Time Traveller was one of those men who are too clever to be believed: you never felt that you saw all round him; you always suspected some subtle reserve, some ingenuity in ambush, behind his lucid frankness.</p>

  <p>Had Filby shown the model and explained the matter in the Time Traveller's words, we should have shown him far less scepticism. For we should have perceived his motives: a pork-butcher could understand Filby. But the Time Traveller had more than a touch of whim among his elements, and we distrusted him.</p>

  <p>Things that would have made the fame of a less clever man seemed tricks in his hands. It is a mistake to do things too easily. The serious people who took him seriously never felt quite sure of his deportment; they were somehow aware that trusting their reputations for judgment with him was like furnishing a nursery with eggshell china.</p>

  <p>So I don't think any of us said very much about time travelling in the interval between that Thursday and the next, though its odd potentialities ran, no doubt, in most of our minds: its plausibility, that is, its practical incredibleness, the curious possibilities of anachronism and of utter confusion it suggested.</p>

  <p>For my own part, I was particularly preoccupied with the trick of the model. That I remember discussing with the Medical Man, whom I met on Friday at the Linnean. He said he had seen a similar thing at Tubingen, and laid considerable stress on the blowing-out of the candle. But how the trick was done he could not explain.</p>
</body>
</html>`
);

const buffer = await zip.generateAsync({
  type: "nodebuffer",
  mimeType: "application/epub+zip",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});

writeFileSync("public/sample.epub", buffer);
console.log(`Created public/sample.epub (${buffer.length} bytes)`);
