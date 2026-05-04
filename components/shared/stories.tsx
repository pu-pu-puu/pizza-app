'use client';

import { Api } from '@/services/api-client';
import { IStory } from '@/services/stories';
import React from 'react';
import { Container } from './container';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  className?: string;
}

const STORY_INTERVAL_MS = 4500;

const isValidImageUrl = (url?: string | null): url is string =>
  Boolean(url && /^https?:\/\//.test(url));

export const Stories: React.FC<Props> = ({ className }) => {
  const [stories, setStories] = React.useState<IStory[]>([]);
  const [hasLoadedStories, setHasLoadedStories] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = React.useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = React.useState(0);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const selectedStory = stories[selectedStoryIndex];
  const selectedItems = React.useMemo(() => {
    if (!selectedStory) return [];

    const itemUrls = selectedStory.items
      .map((item) => item.sourceUrl)
      .filter(isValidImageUrl);

    return itemUrls.length > 0 ? itemUrls : [selectedStory.previewImageUrl];
  }, [selectedStory]);

  const selectedItemUrl = selectedItems[selectedItemIndex];

  const updateScrollState = React.useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      setCanScrollPrev(false);
      setCanScrollNext(false);
      return;
    }

    setCanScrollPrev(element.scrollLeft > 4);
    setCanScrollNext(
      element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
    );
  }, []);

  const fetchStories = React.useCallback(async () => {
    try {
      const data = await Api.stories.getAll();
      setStories(data);
    } catch {
      setStories((current) => current);
    } finally {
      setHasLoadedStories(true);
    }
  }, []);

  React.useEffect(() => {
    fetchStories();

    const interval = window.setInterval(() => fetchStories(), 15000);
    const onFocus = () => fetchStories();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchStories]);

  React.useEffect(() => {
    const timeout = window.setTimeout(updateScrollState, 0);
    window.addEventListener('resize', updateScrollState);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [stories.length, updateScrollState]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onClickStory = (index: number) => {
    const story = stories[index];
    setSelectedStoryIndex(index);
    setSelectedItemIndex(0);

    if (isValidImageUrl(story.previewImageUrl)) {
      setOpen(true);
    }
  };

  const scrollStories = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollBy({
      left: direction * 528,
      behavior: 'smooth',
    });
  };

  const openPreviousStory = () => {
    if (selectedItemIndex > 0) {
      setSelectedItemIndex((index) => index - 1);
      return;
    }

    setSelectedStoryIndex((index) =>
      index === 0 ? stories.length - 1 : index - 1,
    );
    setSelectedItemIndex(0);
  };

  const openNextStory = () => {
    if (selectedItemIndex < selectedItems.length - 1) {
      setSelectedItemIndex((index) => index + 1);
      return;
    }

    setSelectedStoryIndex((index) =>
      index === stories.length - 1 ? 0 : index + 1,
    );
    setSelectedItemIndex(0);
  };

  const closeOrOpenNextStory = React.useCallback(() => {
    if (selectedItemIndex < selectedItems.length - 1) {
      setSelectedItemIndex((index) => index + 1);
      return;
    }

    if (stories.length <= 1 || selectedStoryIndex === stories.length - 1) {
      setOpen(false);
      return;
    }

    setSelectedStoryIndex((index) => index + 1);
    setSelectedItemIndex(0);
  }, [selectedItemIndex, selectedItems.length, selectedStoryIndex, stories.length]);

  React.useEffect(() => {
    if (!open || selectedItems.length === 0) return;

    const timeout = window.setTimeout(closeOrOpenNextStory, STORY_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [closeOrOpenNextStory, open, selectedItems.length]);

  return (
    <>
      <Container className={cn('relative my-8', className)}>
        <div className='relative max-w-[1128px]'>
          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            className='no-scrollbar flex gap-2 overflow-x-auto scroll-smooth pr-14'
          >
            {!hasLoadedStories &&
              stories.length === 0 &&
              [...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className='h-[204px] min-w-[164px] animate-pulse rounded-3xl bg-gray-100'
                />
              ))}

            {stories.map((story, index) => (
              <button
                key={story.id}
                type='button'
                onClick={() => onClickStory(index)}
                className='group relative h-[204px] min-w-[164px] overflow-hidden rounded-3xl bg-gray-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg'
              >
                <img
                  className='h-full w-full object-cover transition duration-300 group-hover:scale-105'
                  height={204}
                  width={164}
                  src={story.previewImageUrl}
                  alt={`Story ${story.id}`}
                />
                <span className='pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-black/5' />
                <span className='pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent opacity-80' />
              </button>
            ))}
          </div>

          {canScrollPrev && (
            <>
              <div className='pointer-events-none absolute bottom-0 left-0 top-0 z-[1] w-28 bg-gradient-to-r from-white via-white/80 to-transparent' />
              <button
                type='button'
                aria-label='Scroll stories left'
                onClick={() => scrollStories(-1)}
                className='absolute -left-5 top-1/2 z-[2] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-primary shadow-lg transition hover:scale-105'
              >
                <ChevronLeft className='h-7 w-7' />
              </button>
            </>
          )}

          {canScrollNext && (
            <>
              <div className='pointer-events-none absolute bottom-0 right-0 top-0 z-[1] w-28 bg-gradient-to-l from-white via-white/80 to-transparent' />
              <button
                type='button'
                aria-label='Scroll stories right'
                onClick={() => scrollStories(1)}
                className='absolute -right-5 top-1/2 z-[2] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-primary shadow-lg transition hover:scale-105'
              >
                <ChevronRight className='h-7 w-7' />
              </button>
            </>
          )}
        </div>
      </Container>

      {open && selectedStory && selectedItemUrl && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm'
          onClick={() => setOpen(false)}
        >
          <div
            className='relative flex items-center justify-center'
            onClick={(event) => event.stopPropagation()}
          >
            {stories.length > 1 && (
              <button
                type='button'
                onClick={openPreviousStory}
                className='absolute -left-20 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 lg:flex'
                aria-label='Previous story'
              >
                <ChevronLeft className='h-8 w-8' />
              </button>
            )}

            <div className='relative h-[720px] w-[450px] max-h-[90vh] max-w-[calc(100vw-32px)] overflow-hidden rounded-[28px] bg-black shadow-2xl'>
              <div className='absolute left-4 right-4 top-3 z-20 flex gap-1.5'>
                {selectedItems.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className='h-0.5 flex-1 overflow-hidden rounded-full bg-white/35'
                  >
                    <div
                      key={`${selectedStory.id}-${selectedItemIndex}-${index}`}
                      className={cn(
                        'h-full rounded-full bg-white',
                        index === selectedItemIndex && 'story-progress-animation',
                      )}
                      style={{
                        width:
                          index < selectedItemIndex
                            ? '100%'
                            : index === selectedItemIndex
                              ? undefined
                              : '0%',
                      }}
                    />
                  </div>
                ))}
              </div>

              <button
                type='button'
                className='absolute right-3 top-7 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-500 shadow-sm transition hover:bg-white hover:text-gray-900'
                onClick={() => setOpen(false)}
                aria-label='Close stories'
              >
                <X className='h-5 w-5' />
              </button>

              <img
                key={`${selectedStory.id}-${selectedItemIndex}`}
                src={selectedItemUrl}
                alt={`Story ${selectedStory.id}`}
                className='h-full w-full object-cover'
              />
            </div>

            {stories.length > 1 && (
              <button
                type='button'
                onClick={openNextStory}
                className='absolute -right-20 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 lg:flex'
                aria-label='Next story'
              >
                <ChevronRight className='h-8 w-8' />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
