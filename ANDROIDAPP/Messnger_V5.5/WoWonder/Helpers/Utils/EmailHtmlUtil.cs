using Android.Graphics;
using Android.Text;
using Android.Text.Style;
using Java.Lang;
using Java.Util.Regex;
using StringBuilder = System.Text.StringBuilder;

namespace WoWonder.Helpers.Utils
{
    /// <summary>
    /// https://github.com/chen-xiao-dong/RichEditText
    /// </summary>
    public class EmailHtmlUtil
    {

        // Regex that matches characters that have special meaning in HTML. '<',
        // '>', '&' and
        // multiple continuous spaces.
        private static readonly Pattern PlainTextToEscape = Pattern.Compile("[<>&]| {2,}|\r?\n");

        /// <summary>
        /// Escape some special character as HTML escape sequence.
        /// </summary>
        /// <param name="text">Text to be displayed using WebView. </param>
        /// <returns> Text correctly escaped. </returns>
        public static string EscapeCharacterToDisplay(string text)
        {
            Pattern pattern = PlainTextToEscape;
            Matcher match = pattern.Matcher(text);

            if (match.Find())
            {
                StringBuilder @out = new StringBuilder();
                int end = 0;
                do
                {
                    int start = match.Start();
                    @out.Append(text.Substring(end, start - end));
                    end = match.End();
                    int c = char.ConvertToUtf32(text, start);
                    switch (c)
                    {
                        case ' ':
                            {
                                // Escape successive spaces into series of "&nbsp;".
                                for (int i = 1, n = end - start; i < n; ++i)
                                {
                                    @out.Append("&nbsp;");
                                }
                                @out.Append(' ');
                                break;
                            }
                        case '\r':
                        case '\n':
                            @out.Append("<br>");
                            break;
                        case '<':
                            @out.Append("&lt;");
                            break;
                        case '>':
                            @out.Append("&gt;");
                            break;
                        case '&':
                            @out.Append("&amp;");
                            break;
                    }
                } while (match.Find());
                @out.Append(text.Substring(end));
                text = @out.ToString();
            }
            return text;
        }

        public static string ToHtml(ISpanned spans)
        {
            StringBuilder @out = new StringBuilder();
            WithinHtml(@out, spans);
            return @out.ToString();
        }

        private static void WithinHtml(StringBuilder @out, ISpanned text)
        {
            int len = text.Length();

            int next;
            for (int i = 0; i < text.Length(); i = next)
            {
                next = text.NextSpanTransition(i, len, Class.FromType(typeof(IParagraphStyle)));
                var style = text.GetSpans(i, next, Class.FromType(typeof(IParagraphStyle)));

                string elements = " ";
                bool needDiv = false;
                foreach (var o in style)
                {
                    if (o is IAlignmentSpan alignmentSpan)
                    {
                        Layout.Alignment align = alignmentSpan.Alignment;
                        needDiv = true;
                        if (align == Layout.Alignment.AlignCenter)
                        {
                            elements = "align=\"center\" " + elements;
                        }
                        else if (align == Layout.Alignment.AlignOpposite)
                        {
                            elements = "align=\"right\" " + elements;
                        }
                        else
                        {
                            elements = "align=\"left\" " + elements;
                        }
                    }
                }

                if (needDiv)
                {
                    @out.Append("<div " + elements + ">");
                }

                WithinDiv(@out, text, i, next);

                if (needDiv)
                {
                    @out.Append("</div>");
                }
            }
        }

        private static void WithinDiv(StringBuilder @out, ISpanned text, int start, int end)
        {
            int next;
            for (int i = start; i < end; i = next)
            {
                next = text.NextSpanTransition(i, end, Class.FromType(typeof(QuoteSpan)));
                var quotes = text.GetSpans(i, next, Class.FromType(typeof(QuoteSpan)));

                foreach (var quote in quotes)
                {
                    @out.Append("<blockquote>");
                }

                WithinBlockquote(@out, text, i, next);

                foreach (var quote in quotes)
                {
                    @out.Append("</blockquote>\n");
                }
            }
        }

        private static void WithinBlockquote(StringBuilder @out, ISpanned text, int start, int end)
        {
            @out.Append(GetOpenParaTagWithDirection(text, start, end));

            int next;
            for (int i = start; i < end; i = next)
            {
                next = TextUtils.IndexOf(text, '\n', i, end);
                if (next < 0)
                {
                    next = end;
                }

                int nl = 0;

                while (next < end && text.CharAt(next) == '\n')
                {
                    nl++;
                    next++;
                }

                WithinParagraph(@out, text, i, next - nl, nl, next == end);
            }

            @out.Append("</p>\n");
        }

        private static string GetOpenParaTagWithDirection(ISpanned text, int start, int end)
        {
            return "<p dir=\"ltr\">";
        }

        private static void WithinParagraph(StringBuilder @out, ISpanned text, int start, int end, int nl, bool last)
        {
            int next;
            for (int i = start; i < end; i = next)
            {
                next = text.NextSpanTransition(i, end, Class.FromType(typeof(CharacterStyle)));
                var style = text.GetSpans(i, next, Class.FromType(typeof(CharacterStyle)));

                if (style == null)
                    continue;

                foreach (var o in style)
                {
                    if (o is StyleSpan styleSpan)
                    {
                        var s = styleSpan.Style;

                        switch (s)
                        {
                            case TypefaceStyle.Bold:
                                @out.Append("<b>");
                                break;
                            case TypefaceStyle.Italic:
                                @out.Append("<i>");
                                break;
                        }
                    }
                    if (o is TypefaceSpan typefaceSpan)
                    {
                        string s = typefaceSpan.Family;

                        if (s.Equals("monospace"))
                        {
                            @out.Append("<tt>");
                        }
                    }
                    if (o is SuperscriptSpan superscriptSpan)
                    {
                        @out.Append("<sup>");
                    }
                    if (o is SubscriptSpan subscriptSpan)
                    {
                        @out.Append("<sub>");
                    }
                    if (o is UnderlineSpan underlineSpan)
                    {
                        @out.Append("<u>");
                    }
                    if (o is StrikethroughSpan strikethroughSpan)
                    {
                        @out.Append("<strike>");
                    }
                    if (o is URLSpan urlSpan)
                    {
                        @out.Append("<a href=\"");
                        @out.Append(urlSpan.URL);
                        @out.Append("\">");
                    }
                    if (o is ImageSpan imageSpan)
                    {
                        @out.Append("<img src=\"");
                        @out.Append(imageSpan.Source);
                        @out.Append("\">");

                        // Don't output the dummy character underlying the image.
                        i = next;
                    }
                    if (o is AbsoluteSizeSpan absoluteSizeSpan)
                    {
                        @out.Append($"<span style=\"font-size:{absoluteSizeSpan.Size / 3:D}px;\">");
                    }
                    if (o is ForegroundColorSpan foregroundColorSpan)
                    {
                        @out.Append("<font color =\"#");
                        string color = (foregroundColorSpan.ForegroundColor + 0x01000000).ToString("x");
                        while (color.Length < 6)
                        {
                            color = "0" + color;
                        }
                        @out.Append(color);
                        @out.Append("\">");
                    }
                    if (o is BackgroundColorSpan backgroundColorSpan)
                    {
                        @out.Append("<font style =\"background-color:#");
                        string color = (backgroundColorSpan.BackgroundColor + 0x01000000).ToString("x");
                        while (color.Length < 6)
                        {
                            color = "0" + color;
                        }
                        @out.Append(color);
                        @out.Append("\">");
                    }
                }

                WithinStyle(@out, text, i, next);

                for (int j = style.Length - 1; j >= 0; j--)
                {
                    if (style[j] is BackgroundColorSpan backgroundColorSpan)
                    {
                        @out.Append("</font>");
                    }
                    if (style[j] is ForegroundColorSpan foregroundColorSpan)
                    {
                        @out.Append("</font>");
                    }
                    //if (style[j] instanceof AbsoluteSizeSpan) {
                    //	out.append("</font>");
                    //      int fontSize =  ((HtmlAbsoluteSizeSpan) style[j]).getHtmlFontSize();
                    //      if(fontSize>HtmlAbsoluteSizeSpan.STANDARD_FONT_SIZE)
                    //      {
                    //          out.append("</big>");
                    //      }
                    //      else if(fontSize < HtmlAbsoluteSizeSpan.STANDARD_FONT_SIZE)
                    //      {
                    //          out.append("</small>");
                    //      }
                    //}
                    if (style[j] is AbsoluteSizeSpan absoluteSizeSpan)
                    {
                        @out.Append("</span>");
                    }
                    if (style[j] is URLSpan urlSpan)
                    {
                        @out.Append("</a>");
                    }
                    if (style[j] is StrikethroughSpan strikethroughSpan)
                    {
                        @out.Append("</strike>");
                    }
                    if (style[j] is UnderlineSpan underlineSpan)
                    {
                        @out.Append("</u>");
                    }
                    if (style[j] is SubscriptSpan subscriptSpan)
                    {
                        @out.Append("</sub>");
                    }
                    if (style[j] is SuperscriptSpan superscriptSpan)
                    {
                        @out.Append("</sup>");
                    }
                    if (style[j] is TypefaceSpan typefaceSpan)
                    {
                        string s = typefaceSpan.Family;

                        if (s.Equals("monospace"))
                        {
                            @out.Append("</tt>");
                        }
                    }
                    if (style[j] is StyleSpan styleSpan)
                    {
                        var s = styleSpan.Style;

                        switch (s)
                        {
                            case TypefaceStyle.Bold:
                                @out.Append("</b>");
                                break;
                            case TypefaceStyle.Italic:
                                @out.Append("</i>");
                                break;
                        }
                    }
                }
            }

            string p = last ? "" : "</p>\n" + GetOpenParaTagWithDirection(text, start, end);

            if (nl == 1)
            {
                @out.Append("<br>\n");
            }
            else if (nl == 2)
            {
                @out.Append(p);
            }
            else
            {
                for (int i = 2; i < nl; i++)
                {
                    @out.Append("<br>");
                }
                @out.Append(p);
            }
        }

        private static void WithinStyle(StringBuilder @out, ICharSequence text, int start, int end)
        {
            for (int i = start; i < end; i++)
            {
                char c = text.CharAt(i);

                switch (c)
                {
                    case '<':
                        @out.Append("&lt;");
                        break;
                    case '>':
                        @out.Append("&gt;");
                        break;
                    case '&':
                        @out.Append("&amp;");
                        break;
                    case > (char)0x7E:
                    case < ' ':
                        @out.Append("&#" + ((int)c) + ";");
                        break;
                    case ' ':
                        {
                            while (i + 1 < end && text.CharAt(i + 1) == ' ')
                            {
                                @out.Append("&nbsp;");
                                i++;
                            }

                            @out.Append(' ');
                            break;
                        }
                    default:
                        @out.Append(c);
                        break;
                }
            }
        }
    }
}