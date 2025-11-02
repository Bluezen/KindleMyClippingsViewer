// Wait for the HTML page to be fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // Get the HTML elements we need
    const fileInput = document.getElementById('clippingsFile');
    const outputArea = document.getElementById('output');
    const statusDiv = document.getElementById('status');
    const htmlOutputDiv = document.getElementById('html-output');

    // Listen for the "change" event on our file input
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            statusDiv.textContent = "No file selected.";
            return;
        }

        statusDiv.textContent = `Reading file "${file.name}"...`;
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const content = e.target.result;

                // 1. Parse the content
                const clippings = parseClippings(content);

                // 2. Group and sort the clippings
                const groupedData = groupClippings(clippings);

                // 3. Generate the Markdown
                const markdown = formatAsMarkdown(groupedData);
                outputArea.value = markdown;

                // 4. Display the dynamic HTML
                displayAsHtml(groupedData, htmlOutputDiv);

                // 5. Update the status
                statusDiv.textContent = `Parsing complete! ${clippings.length} unique highlights found.`;

            } catch (error) {
                statusDiv.textContent = `Error during parsing: ${error.message}`;
                console.error(error);
            }
        };

        reader.onerror = () => {
            statusDiv.textContent = "Error reading the file.";
        };

        reader.readAsText(file, 'UTF-8');
    });

    /**
     * Step 1: Parse the raw content
     */
    function parseClippings(content) {
        // Handle both Windows (\r\n) and Unix (\n) line endings
        const universalContent = content.replace(/\r\n/g, '\n');

        // Split the file into "blocks" separated by '=========='
        const rawClippings = universalContent.split('==========');

        // Use a Map to handle duplicates.
        const clippingsMap = new Map();

        // Regex to find a location RANGE (e.g., 123-456).
        const locationRangeRegex = /(\d+)-(\d+)/;

        for (const rawClipping of rawClippings) {
            const lines = rawClipping
                .trim()
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Filter 1 : Must have at least 3 parts (Title, Meta, Content)
            if (lines.length < 3) {
                continue;
            }

            const metaLine = lines[1];

            // Filter 2 : Meta line must contain a location *range*.
            const locationMatch = metaLine.match(locationRangeRegex);

            if (!locationMatch) {
                // This is not a highlight.
                // It's probably a Note or Bookmark with a single location number.
                continue;
            }

            // ----- It's a valid highlight, let's process it -----

            // 1. Title and Author
            const titleLine = lines[0];
            let title = titleLine;
            let author = 'Unknown Author';
            const authorMatch = titleLine.match(/\(([^)]+)\)$/);
            if (authorMatch) {
                author = authorMatch[1];
                title = titleLine.substring(0, authorMatch.index).trim();
            }

            // 2. Location
            // We use the matched range (e.g., "1035-1036") as the core part.
            const location = locationMatch[0]; // e.g., "1035-1036"

            // 3. Content
            const contentText = lines.slice(2).join('\n'); // All remaining lines are content

            // 4. Metadata (for display)
            // Clean the meta line (remove leading '- ')
            let displayMeta = lines[1];
            if (displayMeta.startsWith('- ')) {
                displayMeta = displayMeta.substring(2);
            }

            // ----- De-duplication -----

            // Key is Title + Location Range
            const key = `${title}|${location}`;
            const existingClipping = clippingsMap.get(key);

            const newClipping = {
                title,
                author,
                location, // The "1035-1036" part
                metaLine: displayMeta, // The full, cleaned meta string
                content: contentText,
                contentLength: contentText.length // Store length for comparison
            };

            // If it doesn't exist, OR if the new one is LONGER than the old one...
            if (!existingClipping || newClipping.contentLength > existingClipping.contentLength) {
                // ...save it (or replace the old one)
                clippingsMap.set(key, newClipping);
            }
        }
        // Convert the Map into a simple array of highlights
        return Array.from(clippingsMap.values());
    }

    /**
     * Step 2: Group and Sort the clippings
     */
    function groupClippings(clippings) {
        const groupedByBook = {};

        for (const clip of clippings) {
            if (!groupedByBook[clip.title]) {
                groupedByBook[clip.title] = {
                    author: clip.author,
                    clips: []
                };
            }
            groupedByBook[clip.title].clips.push(clip);
        }

        // Sort the highlights within each book by their location
        for (const title in groupedByBook) {
            groupedByBook[title].clips.sort((a, b) => {
                // 'location' is now "123-456", this logic still works.
                const getLocNum = (loc) => parseInt(loc.match(/(\d+)/)[0] || 0);
                return getLocNum(a.location) - getLocNum(b.location);
            });
        }
        return groupedByBook;
    }


    /**
     * Step 3: Format as Markdown
     */
    function formatAsMarkdown(groupedByBook) {
        let markdownOutput = `# My Kindle Highlights\n\n`;

        for (const title in groupedByBook) {
            const book = groupedByBook[title];

            markdownOutput += `## ${title}\n`;
            markdownOutput += `### by ${book.author}\n\n`;

            for (const clip of book.clips) {
                const quoteContent = clip.content.split('\n').join('\n> ');
                markdownOutput += `> ${quoteContent}\n`;
                // 'metaLine' now contains the full, original (but cleaned) string
                markdownOutput += `> (${clip.metaLine})\n\n`;
            }
            markdownOutput += `----\n\n`;
        }
        return markdownOutput;
    }

    /**
      * Step 4: Display dynamically as HTML (Accordion Version)
      */
    function displayAsHtml(groupedByBook, container) {
        // Clear the old content (the placeholder)
        container.innerHTML = '';

        // Loop over each book
        for (const title in groupedByBook) {
            const book = groupedByBook[title];

            // 1. Create the main container for this book (header + list)
            const bookContainer = document.createElement('div');
            bookContainer.className = 'book-container';

            // 2. Create the clickable header
            const bookHeader = document.createElement('div');
            bookHeader.className = 'book-header';

            // Create a div for title/author text
            const textWrapper = document.createElement('div');

            const titleEl = document.createElement('h3');
            titleEl.className = 'book-title';
            titleEl.textContent = title;

            const authorEl = document.createElement('h4');
            authorEl.className = 'book-author';
            authorEl.textContent = `by ${book.author}`;

            textWrapper.appendChild(titleEl);
            textWrapper.appendChild(authorEl);
            bookHeader.appendChild(textWrapper); // Add text wrapper to header

            // 3. Create the hidden list of clippings
            const clippingsList = document.createElement('div');
            clippingsList.className = 'clippings-list';

            // Loop to add all quotes *inside* this hidden list
            for (const clip of book.clips) {
                const quoteEl = document.createElement('blockquote');
                quoteEl.className = 'clipping-quote';

                const contentEl = document.createElement('p');
                contentEl.innerHTML = clip.content.replace(/\n/g, '<br>');

                const metaEl = document.createElement('small');
                metaEl.textContent = `(${clip.metaLine})`;

                quoteEl.appendChild(contentEl);
                quoteEl.appendChild(metaEl);

                // Add the quote to the (hidden) list
                clippingsList.appendChild(quoteEl);
            }

            // 4. --- CLICK EVENT ---
            // Add the click event listener TO THE HEADER
            bookHeader.addEventListener('click', () => {
                // Toggle the 'active' class on the header (for the arrow)
                bookHeader.classList.toggle('active');

                // Toggle the display of the clippings list
                if (clippingsList.style.display === 'block') {
                    clippingsList.style.display = 'none';
                } else {
                    clippingsList.style.display = 'block';
                }
            });

            // 5. Assemble the parts for this book
            bookContainer.appendChild(bookHeader);
            bookContainer.appendChild(clippingsList);

            // 6. Add the complete book container to the main output div
            container.appendChild(bookContainer);
        }
    }
});