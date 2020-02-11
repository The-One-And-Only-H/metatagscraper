import { Parser, ElementType } from "htmlparser2";
import { DomHandler } from "domhandler";

/**
 * Config
 */
const config = {
  normalizeWhitespace: false,
  withStartIndices: false,
  withEndIndices: false
};

/**
 * Parsing
 */
const parseDOM = dom => {
  const response = dom.map(node => {
    // Er...
    const element = node;

    switch (element.name) {
      case "a": {
        return yieldTextFromAnchor(element);
      }
      case "p":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
      case "dd":
      case "div":
      case "pre":
      case "label":
      case "blockquote": {
        return `<p>${yieldTextFromParagraph(element)}</p>`;
      }

      case "3": // Very specific Brick
      case "333": // Very specific Brick
      case "i":
      case "u":
      case "b":
      case "s":
      case "em":
      case "dt":
      case "dl":
      case "tt":
      case "del":
      case "sup":
      case "sub":
      case "span":
      case "abbr":
      case "cite":
      case "font":
      case "name":
      case "small":
      case "center":
      case "strong":
      case "strike":
      case "address": {
        return yieldPlainText(element);
      }

      case "ol": {
        return yieldOrderedList(element);
      }

      case "ul": {
        return yieldUnorderedList(element);
      }

      case "li": {
        return yieldListItem(element);
      }

      case "img": {
        return yieldImage(element);
      }

      // Forcefully remove
      case "tr":
      case "word":
      case "form":
      case "table":
      case "iframe":
      case "edited":
      case "insert":
      case "fieldset": {
        return `\n<p>[REMOVED]</p>\n`;
      }

      case "br": {
        return "<br />";
      }

      // Silently remove
      case "hr":
      case "var":
      case "html":
      case "embed":
      case "input":
      case "button":
      case "select":
      case "option":
      case "script":
      case "script1":
      case "checkbox":
      case "textarea": {
        return "";
      }

      default: {
        switch (element.type) {
          case "text": {
            const node = element;
            return node.data;
          }

          // Ignore things
          case "comment":
          case "directive": {
            return "";
          }
        }

        log.warn("Uncaught tag", JSON.stringify(element), {
          spaceBefore: true
        });
        return "";
      }
    }
  });

  return response.join("");
};

const yieldTextFromParagraph = paragraph => {
  if (paragraph.children.length < 1) {
    return "";
  }

  return parseDOM(paragraph.children);
};

const yieldTextFromAnchor = anchor => {
  // Check to see if the anchor text has children
  // Sometimes they have <strong>s - but these should render as plaintext
  let text = "";

  if (anchor.children.length < 1) {
    const node = anchor;
    text = node.data;
  } else {
    const element = anchor;
    text = yieldPlainText(element);
  }

  if (!text || text.trim() === "") {
    // No text.. so, render nothing
    return "";
  }

  let link = anchor.attribs.href;

  if (!link || link.trim() === "") {
    // No href.. so, just render the text
    return text;
  }

  link = fixHref(link);

  return `<a href="${link}">${text}</a>`;
};

const yieldPlainText = element => {
  if (element.children.length < 1) {
    const text = element;
    return text.data;
  }

  return parseDOM(element.children);
};

const yieldImage = element => {
  let text = "";

  const { src, alt } = element.attribs;

  text = `<img src="${src}" alt="${alt}" />`;

  return text;
};

const yieldOrderedList = element => {
  let list = "<ol>";
  list += parseDOM(element.children);
  list += "</ol>";

  return list;
};

const yieldUnorderedList = element => {
  let list = "<ul>";
  list += parseDOM(element.children);
  list += "</ul>";

  return list;
};

const yieldListItem = element => {
  let item = "<li>";
  item += yieldPlainText(element);
  item += "</li>";

  return item;
};

/**
 * Removes typings from the DOM so we can use the rendered output
 * @param nodes DOM
 */
const clean = nodes => {
  return nodes.forEach(node => {
    delete node.parent;
    delete node.prev;
    delete node.next;
    delete node.endIndex;
    delete node.startIndex;

    if (node.type === ElementType.Tag) {
      // Recursively delete the problematic circular references
      const element = node;
      clean(element.children);
    }
  });
};

/**
 * Fixes the hard-coded relative hyperlinks for some Posts
 */
const fixHref = href => {
  let fixed = href;

  // Removes everything between the braces: (\\\")
  // eg: "\\\"https://www.bigwhitewall.com/talkabouts/post/\\\""
  fixed = fixed.replace(/\\\"/g, "");

  // <a href="../432148/">
  // <a href="../432011/#Comment1295781">
  // <a href="../427943/welcome/#Comment1295906">
  fixed = fixed.replace("..", "https://www.bigwhitewall.com/talkabouts/thread");

  return fixed;
};

/**
 * Parse an HTML string into a string without superfluous HTML tags that can
 *  in turn be parsed into JSON by DraftJS utility tools.
 *
 * @remarks
 *  This method replaces `sanitiseBodyForDraft` and the `html-to-text` package.
 *  `501816c` is the last commit with those in the codebase.
 *
 * @param input The body of a Comment, Message, Note, or Journal
 */
export const parseHtmlToString = input => {
  // This fixes double-quotes on certain HTML element attributes
  // e.g.: <a href=""some-link"">example</a>
  let withReplacements = input
    .replace(/\=\"\"/g, '=\\"')
    .replace(/\"\">/g, '\\">');

  // This removes returns (\r), because we only want new-lines (\n)
  withReplacements = withReplacements.replace(/\\r/g, "");

  // This replaces &nbsp; with normal spaces
  withReplacements = withReplacements.replace(/&nbsp;/g, " ");

  // This removes tabs (\t)
  withReplacements = withReplacements.replace(/\\t/g, "");

  // This removes badly formatted paragraphs
  withReplacements = withReplacements.replace(/&lt;\/?p&gt;/g, "");

  withReplacements = replaceQuestionMarks(withReplacements);

  // Very specific post
  withReplacements = withReplacements.replace(
    "<-------------------------------this",
    "|-------------------------------this"
  );
  withReplacements = withReplacements.replace(
    "much--------------------------------------------->",
    "much---------------------------------------------|"
  );

  // ---

  let response = "";

  const cb = (error, dom) => {
    if (error) {
      // Handle error
      log.error(error, null, { spaceBefore: true });
    } else {
      // Parsing completed
      const clone = [...dom];

      clean(clone);

      // log.info(JSON.stringify(clone), null, { spaceAfter: true });

      response = parseDOM(clone);
    }
  };

  const handler = new DomHandler(cb, config);
  const parser = new Parser(handler);

  parser.write(withReplacements);
  parser.end();

  // ---

  return makeHtml(response);
};

const makeHtml = input => {
  let output = `<p>${input.trim()}</p>`;

  // Deduplicate opening and closing tags
  output = output.replace(/( )?<p>( )?<p>( )?/g, "<p>");
  output = output.replace(/( )?<\/p>( )?<\/p>( )?/g, "</p>");

  output = output.replace(/\n/g, "<br />");

  // Replace empty tags
  output = output.replace(/( )?<p>( )?<\/p>( )?/g, "");

  // Remove superfluous line-breaks
  output = output.replace(/( )?<\/p>(<br \/>)+( )?/g, "</p>");
  output = output.replace(/( )?(<br \/>)+( )?<\p>( )?/g, "<p>");
  output = output.replace(/( )?(<br \/>)+( )?<\/p>( )?/g, "</p>");
  output = output.replace(/( )?<\/p>( )?<br \/>( )?<p>( )?/g, "</p><p>");

  // Remove extra whitespace
  output = output.replace(/( )?<\/p>( )?<p>( )?/g, "</p><p>");

  return output;
};

/**
 *
 * Tests - uncomment the forEach at the bottom of this file.
 *
 */

const one = `Hey SW,
I was the target of a hack attack so have been awol while I dealt with that.

Well good friends are the ones who will be honest and tell you if you ask them.  But it sounds like your friends say this unprompted so that is generally words that are true I reckon :)

Wow is right!  Good for you - so this is someone giving you feedback that you can trust.  That's right though - keep breathing and see it as a step at a time - one cake by one cake - though it sounds already like you have a reputation and that is a good thing.

Ease off on the pressure - and you won't mess it up SW - just relax and take it slow.

I am really very happy for you.

xxxxxxxxx`;

const two = `<p>Hello thewife,</p>
<p>We can hear that the situation is certainly pushing you to your limits, and you are looking to set some boundaries to protect yourself. We think this is important and we are also sorry to hear that military welfare does not seem to be responding in the way they should. Thewife, we think you have raised some important issues here, which we think would really be worth to post in a <a href=""https://www.bigwhitewall.com/talkabouts/post/"">community talkabout</a>, so more help and support can come to you. In the meantime, we wish that you are continuing to take care and be gentle with yourself, and do remember that you are the No.1 priority in your life.</p>
<p>Best wishes,<br />WG</p>`;

const three = ` <p>Hi Fleur and Mo</p> <p>&nbsp;</p> <p>Here are WG1 notes</p> <p>Thanks</p> <p>Janet</p> <p>&nbsp;</p> <p><strong>Risk: </strong></p> <p><a href=""../159836/""><strong>Escalation GTA</strong></a></p> <p>&nbsp;</p> <p><strong>Issues:</strong></p> <p>&nbsp;</p> <p><strong>Members on ?mute?:</strong></p> <p>&nbsp;</p> <p><strong>Issues requiring action/ongoing:</strong></p> <p><a href=""../431115/""><span>Ne15</span></a><span>&nbsp;posted a CTA called &quot;Self-Harm&quot; with contents &quot;Trying to self-harm&quot;. We have moderated and deleted this CTA. As they have been previously warned, we have sent a FINAL warning, any further edits or breach of house rules will lead to deactivation. Review notes updated and PTA sent.</span></p> <p><span>&nbsp;</span></p> <p><a href=""../427569/welcome/""><span>Iden</span></a><span>&nbsp;? 2 PTA check ins sent, and still waiting for member to respond back to us including a request for details. Then we can respond covering the following:</span></p> <p><span>As they have mentioned having a gun, we need to ask if they still have access to that firearm and if they do, we need to urge them to give it to police or let us know details so we can also report that for them</span></p> <p><span>&nbsp;</span></p> <p><span>There is a&nbsp;</span><a href=""../431540/""><span>GTA</span></a><span>&nbsp;for questions for the ED specialist that we will have in supervision</span></p> <p><span>&nbsp;</span></p> <p><span>The brick comment on the dash from Chocolates6 is a tech glitch that can?t be cleared</span></p> <p>&nbsp;</p> <p><strong>Member responses being spaced:</strong></p> <p><span>4-6 hours ? Tu19, nashi, Op91, BEANIEBOY3, Life2003, incidious, Cat2432ca, Boobalah.</span></p> <p><span>8-12 hours ? swflic, Odefault, RedRunner, Rainbow75, akrin2019</span></p> <p>&nbsp;</p> <p><strong>To Dos: </strong></p> <p><a href=""../432148/"">WalksT2s</a> I completed a course with minds matter</p> <p><a href=""../432228/"">Etumos</a> posted a brick in PTA</p> <p><a href=""../432240/"">Etumos</a> are you able to delete it?</p> <p><a href=""../430752/"">Nonamecj</a> debating suicide on and off for some time</p> <p>&nbsp;</p> <p>&nbsp;</p> <p><strong>Done:</strong></p> <p><a href=""../432011/#Comment1295781"">Care1st</a> username change and letting us know they are safe</p> <p><a href=""../427301/#Comment1295776"">TherealNaruto17</a> feels a little bit better</p> <p><a href=""../432151/#Comment1295837"">SleeplessinSeattle</a> worrying about anxiety attacks at the end of the semester</p> <p><a href=""../432080/#Comment1295846"">Anonmue</a>00 (x 2) separation from partner anxiety</p> <p><a href=""../430752/#Comment1295900"">Nonamecj</a> can keep mysef safe for today</p> <p><a href=""../427943/welcome/#Comment1295906"">Coe</a> ex is texting</p> <p><a href=""../432148/#Comment1295911"">Wa1ksT2s</a> our response provides some relief</p> <p><a href=""../431750/welcome/#Comment1295927"">DepressoNespresso</a> will adhere to HR</p> <p><a href=""../432174/#Comment1296009"">Cherrybomb127</a> apologising for WG having to take brick down</p> <p><a href=""../431937/#Comment1296021"">Akrin2019</a> K in response to Dep test ? recloneected</p> <p><a href=""../432236/#Comment1296019"">Akrin2019</a> spoke to MH advisor</p> <p>&nbsp;</p> <p><strong>Edits:</strong></p> <p><strong>&nbsp;</strong></p> <p><strong>Username Edits:</strong></p> <p>Kare1 to Care1st at members request</p> <p>Nathan***** to ColaCube and welcome letter amended</p> <p>Kimberly*** to BearHugs and welcome letter amended</p> <p>Jen******* to WhiskersOnKittens and welcome letter amended</p> <p>Alice******** to Ice98 and welcome letter amended</p> <p>&nbsp;</p> <p><strong>Use of Wall:</strong></p> <p>&nbsp;</p> <p><strong>Cover Support:</strong></p> <p><span>&nbsp;</span></p> `;

const four = `<p style=""line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;""><span style=""font-size: 12pt; font-family: Arial; color: #415766; background-color: transparent; font-weight: 400; font-variant: normal; text-decoration: none; vertical-align: baseline; white-space: pre-wrap;"">Dear Anonymous, </span></p>
<p style=""line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;"">&nbsp;</p>
<p style=""line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;""><span style=""font-size: 12pt; font-family: Arial; color: #415766; background-color: transparent; font-weight: 400; font-variant: normal; text-decoration: none; vertical-align: baseline; white-space: pre-wrap;"">We'd think of it as a cry from the very heart of you. Keep reaching out, we are here to listen.</span></p>
<p style=""line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;"">&nbsp;</p>
<p style=""line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;""><span style=""font-size: 12pt; font-family: Arial; color: #415766; background-color: transparent; font-weight: 400; font-variant: normal; text-decoration: none; vertical-align: baseline; white-space: pre-wrap;"">Warm wishes,</span></p>
<p style=""line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;""><span style=""font-size: 12pt; font-family: Arial; color: #415766; background-color: transparent; font-weight: 400; font-variant: normal; text-decoration: none; vertical-align: baseline; white-space: pre-wrap;"">WG</span></p>
<p>&nbsp;</p>`;

const five = `Removed ""other than to grab the wheel and purposfully crash to end it"" and ""it feels like I should grab that wheel and crash the car""
from post: https://www.bigwhitewall.com/talkabouts/thread/253296/`;

const six = `<p>Hello anon878974</p>
<p>Welcome to the Big White Wall Community; a place for safe and anonymous support between members.</p>
<p>I am a Wall Guide and a trained counsellor.</p>
<h2>Talk to me</h2>
<p>This is a personal talkabout, a private conversation. If you are not quite ready to talk with others is there anything that you would like to share or ask me here? <a href='#ctl00_MainColumn_ReplyButton2'>Post a reply</a> below. If not now, then you can always contact us by clicking on Ask a Wall Guide at the top right of every page. Wall Guides are always around if you need us 24/7.</p>
<h2>Learn more about you</h2>
<p>On your homepage and in the menu, found in the upper left-hand corner, you can find links to
some of the things you can do on Big White Wall, like
<a href='/self-assessment/'>Take a Test</a>
to see how you score on some
common behavioural health tests;
<a href='/walls/brick/create-link/'>Create a Brick</a>
to express yourself artistically;
<a href='/talkabouts/'>Start a Talkabout</a>
to express what you feel or to talk with others; Look up educational self-help materials
in our
<a href='/useful-stuff/'>Useful Stuff</a> section; or
<a href='/guided-support/'>Take a Course</a>
to learn how to better self-manage. Let us know if you have any questions.</p>
<h2>Stay safe</h2>
<p>Remember that everyone is anonymous on Big White Wall so please <a href='/info/keep-safe.aspx' target='_blank'>keep your identity safe</a> and have a look at <a href='/v2/HouseRules.aspx' target='_blank'>how we work together</a> in the Community.</p>
<p>Take care</p>
<p>Wall Guide</p>
`;

const seven = `Dear Big White Wall Member. <BR />We would kindly request that you fill in the following <a href=""https://www.bigwhitewall.com/self-assessment/take-assessment/Impact-Of-Events-Scale/"">questionnaire</a>, so that we get feedback that will be used to help us make sure we deliver LiveTherapy, as well as we can. If you need any further input please contact your referring service. <BR />Many thanks <BR />Big White Wall`;

const eight = `<p><span style=""background-color: rgba(255, 255, 255, 0);"">Day time is fine for next 28 days doctor has signed me off sick from work and appeal hearing was requested by my Neil my union rep to be postponed while he investigates a settlement with them as they may owe compensation and would have to write a reference which predates the capability and final warning as he sees them as unfair. Daytime is therefore fine I am just practicing Chopin like the rain it falls. I am still letting go of issues all around me but feel like I will need to pick up the pieces before it is too late for my career but mum only this morning spoke to me of her sadness about dad as it is her sisters anniversary and she is bitter and jealous. His memories are also still coming back to me uninvited.<br /><br />Thanks.<br /><br />Sent from my iPhone<br /><br /></span></p>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">On 5 Jun 2014, at 15:10, Big White Wall &lt;<a href=""mailto:theteam@bigwhitewall.com"">theteam@bigwhitewall.com</a>&gt; wrote:<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">Hi northern0278,&nbsp;<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">You have received a message from your therapist.<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">Please don&rsquo;t reply to this email as your response will not go to your therapist.<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">Your therapist has made a booking<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">Hello John,&amp;nbsp;&lt;/p&gt;<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&lt;p&gt;I have not yet put our next appointment in the Big White Wall system but I am planning to do so in the next day or so; it is schedules for&nbsp;<a href=""x-apple-data-detectors://2"">Fri 13 June</a>&nbsp;- I have been reviewing my dairy and I am wondering whether you now have any more clarity whether you would be able to have our session earlier in the day rather than late in the evening. I would prefer 9 or&nbsp;<a href=""x-apple-data-detectors://3"">10 am</a>&nbsp;although any time before&nbsp;<a href=""x-apple-data-detectors://4"">5 pm</a>&nbsp;would be better for me; I am keen that our appointment is not the last in my day, as we need to be as grounded as possible especially as this will be our penaltimate session. I am looking forward your reply (please note that I am away so I am not able to check emails regularly, thus your early response is particularly appreciated).&amp;nbsp;&lt;/p&gt;<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&lt;p&gt;Kind regards&lt;/p&gt;<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&lt;p&gt;Pavlo<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">To respond to this message, click here:<a href=""http://www.bigwhitewall.com/talkabouts/thread/53022/"">http://www.bigwhitewall.com/talkabouts/thread/53022/</a><br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">Best wishes,<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">The Team<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">&nbsp;</span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">To view your LiveTherapy bookings visit<a href=""https://www.bigwhitewall.com/live-therapy"">https://www.bigwhitewall.com/live-therapy</a>.<br /></span></blockquote>
<blockquote><span style=""background-color: rgba(255, 255, 255, 0);"">If you need help accessing LiveTherapy, or if you have any questions, please contact<a href=""mailto:theteam@bigwhitewall.com"">theteam@bigwhitewall.com</a>.</span></blockquote>`;

const nine = `<p>Hello El Mariachi, glad to see you around again.</p><p>I have copied some information that might be of help to you, muse, anyone else questioning their alcohol use-</p><p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span style=\"font-size: 11pt\">fromfrom </span><span style=\"font-size: 11pt\">Boston</span><span style=\"font-size: 11pt\"> </span><span style=\"font-size: 11pt\">University</span><span style=\"font-size: 11pt\">: <a href=\"http://www.alcoholscreening.org/\"><font color=\"#800080\">http://www.alcoholscreening.org/</font></a> It opens onto a page where you first enter your age and gender before beginning a questionnaire. I did not do that. I don&rsquo;t know what the questionnaire is like, nor do I know if </span><span style=\"font-size: 11pt\">Boston</span><span style=\"font-size: 11pt\"> </span><span style=\"font-size: 11pt\">University</span><span style=\"font-size: 11pt\"> is funded by a drug manufacturer or some other possibly biased organization either. </span></p><span style=\"font-size: 11pt\">     *****     *****     *****</span><span style=\"font-size: 11pt\"><span> </span><span>                                                   </span></span><span style=\"font-size: 11pt\">And from WHO (World Health Organization: </span><p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span style=\"font-size: 11pt\"><a href=\"http://alcoholselfhelpnews.wordpress.com/2007/04/13/am-i-an-alcoholic-questionnaire/\"><font color=\"#800080\">http://alcoholselfhelpnews.wordpress.com/2007/04/13/am-i-an-alcoholic-questionnaire/</font></a> .<span>  (</span>A downloadable pdf version of this audit (as they call it) is available - if it doesn't present well enough here).</span></p><a name=\"_Toc120367246\"></a><span style=\"font-size: 11pt\">Ask yourself these questions</span><span style=\"font-size: 11pt\"></span><span style=\"font-size: 11pt\">Remember - Honesty arrests Denial</span><strong><span style=\"font-size: 10pt\">Alcohol Use AUDIT</span></strong><span></span> <table border=\"1\" cellspacing=\"1\" cellpadding=\"0\" width=\"100%\" class=\"MsoNormalTable\" style=\"width: 100%\"><tbody><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span style=\"font-size: 10pt\">1. How often do you have a drink containing alcohol?</span><font size=\"5\"> <span style=\"font-size: 12pt\"></span></font></p></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Never</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Monthly or less</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">2-4 times a month</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">2-3 times a week</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">4 or more times a week</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">2. How many drinks containing alcohol do you have on a typical day when you are drinking?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">1 or 2</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">3 or 4</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">5 or 6</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">7-9</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">10 or more</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">3. How often do you have 6 or more drinks on 1 occasion?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Never</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Less than monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Weekly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Daily or almost daily</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">4. How often during the past year have you found that you were not able to stop drinking once you had started?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Never</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Less than monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Weekly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Daily or almost daily</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">5. How often during the past year have you failed to do what was normally expected of you because of drinking?</span><font size=\"5\"> <span style=\"font-size: 12pt\"></span></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Never</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Less than monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Weekly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Daily or almost daily</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">6. How often during the past year have you needed a first drink in the morning to get yourself going after a heavy drinking session?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Never</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Less than monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Weekly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Daily or almost daily</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">7. How often during the past year have you had a feeling of guilt or remorse after drinking?</span><font size=\"5\"> <span style=\"font-size: 12pt\"></span></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Never</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Less than monthly</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Monthly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Weekly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Daily or almost daily</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">8. How often during the past year have you been unable to remember what happened the night before because you had been drinking?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Never</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Less than monthly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Monthly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">Weekly</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Daily or almost daily</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">9. Have you or has someone else been injured as a result of your drinking?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">No</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Yes, but not in the past year</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Yes, during the past year</span><font size=\"3\"><font face=\"Times New Roman\"> </font></font></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">10. Has a relative, friend, or a doctor or other health care worker been concerned about your drinking or suggested you cut down?</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt\">No</span><span style=\"font-size: 12pt\"></span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Yes, but not in the past year</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 10pt; font-family: Verdana\">Yes, during the past year</span></td></tr><tr><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 11pt\">Total scores</span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td><td style=\"background-color: transparent; border: #4fffff; padding: 0.75pt\"><span style=\"font-size: 12pt\"> </span></td></tr></tbody></table><a name=\"_Toc120367226\"></a><strong><span style=\"font-size: 10pt\">The AUDIT &ndash; Alcohol Use Disorders Identification Test. </span></strong><span></span><span></span><span style=\"font-size: 10pt\">The AUDIT was developed under the auspices of the World Health Organization and has become the main instrument used to identify &lsquo;at-risk&rsquo;, problem, and alcoholic drinkers. It has high specificity and sensitivity across a wide cultural and social spectrum.</span><span></span><span style=\"font-size: 10pt\">It has a simple scoring scale and can be completed by the patient/client.</span><span></span><span style=\"font-size: 10pt\">Scoring</span><span></span> <ul><li class=\"MsoNormal\" style=\"margin: 0cm 0cm 0pt; tab-stops: list 36.0pt\"><span style=\"font-size: 10pt\">Questions 1 to 8 scores are from left to right &ndash; 0, 1, 2, 3, 4. </span><span></span></li><li class=\"MsoNormal\" style=\"margin: 0cm 0cm 0pt; tab-stops: list 36.0pt\"><span style=\"font-size: 10pt\">Questions 9 and 10 scores from left to right &ndash; 0, 2, 4. Range 0 to 40.</span><span></span></li></ul><span style=\"font-size: 11pt\"><span>1.<span style=\"font: 7pt 'Times New Roman'\">     </span></span></span><span><span style=\"font-size: 10pt\">Total scores of 8 or more are recommended as indicators of hazardous and harmful alcohol use, as well as possible alcohol dependence.</span></span><span></span><span style=\"font-size: 11pt\"><span>2.<span style=\"font: 7pt 'Times New Roman'\">     </span></span></span><span><span style=\"font-size: 10pt\">People with scores of 15 or more may be considered prime candidates for a diagnosis of alcohol dependence.</span></span><span></span><span style=\"font-size: 10pt\">More detailed interpretation of a patient&rsquo;s total score may be obtained by determining on which questions points were scored. </span><span></span><ul><li class=\"MsoNormal\" style=\"margin: 0cm 0cm 0pt; tab-stops: list 36.0pt\"><span style=\"font-size: 10pt\">Questions 2 or 3 - a score of 1 or more indicates consumption at a hazardous level. </span><span></span></li><li class=\"MsoNormal\" style=\"margin: 0cm 0cm 0pt; tab-stops: list 36.0pt\"><span style=\"font-size: 10pt\">Question 4 to 6 - Points scored above 0 (especially weekly or daily symptoms) imply the presence or beginning of alcohol dependence. </span><span></span></li><li class=\"MsoNormal\" style=\"margin: 0cm 0cm 0pt; tab-stops: list 36.0pt\"><span style=\"font-size: 10pt\">Questions 7 to 10 - Any points scored indicate that alcohol-related harm is already being experienced. </span><span></span></li></ul><p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span style=\"font-size: 10pt\">The final two questions should also be reviewed to determine whether patients give evidence of a past problem (i.e., yes, but not in the past year). Even in the absence of current hazardous drinking, positive responses on these items should be used to discuss the need for vigilance by the patient.</span></p><p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span style=\"font-size: 10pt\"></span></p><span> </span> <p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span style=\"font-size: 10pt\">From &lsquo;How to Help an Alcoholic&rsquo; at <a href=\"http://www.brieftsf.com/\"><font color=\"#0000cc\">www.BriefTSF.com</font></a> and </span><span><a href=\"http://alcoholselfhelpnews.wordpress.com/\"><span style=\"font-size: 10pt\"><font color=\"#0000cc\">http://alcoholselfhelpnews.wordpress.com/</font></span></a></span></p><p style=\"margin: 0cm 0cm 0pt\" class=\"MsoNormal\"><span></span></p><span>    *****     *****     *****</span><span style=\"font-size: 11pt\">Finally, I forund some information on a site called &ldquo;DoIHaveIt.com&rdquo; which states that alcohol is the most dangerous thing to withdraw from &ndash; even more than heroin. I didn&rsquo;t find information about who put the information on this site together, and there is a disclaimer, of-course. They advise people who want to use the advice given to still seek advice from a medical practioner anyway. I think think so too anyway.</span> <p>Do take care. ((hugs)) -Mebenji</p>`;

const raw = [one, two, three, four, five, six, seven, eight, nine];

raw.forEach(val => {
  const parsed = parseHtmlToString(val);
  console.info(parsed);
  console.info("---", null, {
    spaceAfter: true,
    spaceBefore: true
  });
});
