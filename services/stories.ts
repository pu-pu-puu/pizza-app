import { Story, StoryItem } from '@prisma/client';
import { axiosInstance } from './instance';

export type IStory = Story & {
  items: StoryItem[];
};

export const getAll = async () => {
  const { data } = await axiosInstance.get<IStory[]>('/stories', {
    timeout: 5000,
  });

  return data;
};
