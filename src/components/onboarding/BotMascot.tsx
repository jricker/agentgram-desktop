import { useEffect, useState } from "react";
import bot1 from "../../assets/bot-blink.gif";
import bot2 from "../../assets/bot-blink-02.gif";
import bot3 from "../../assets/bot-blink-03.gif";
import bot4 from "../../assets/bot-blink-04.gif";

const BOT_GIFS = [bot1, bot2, bot3, bot4];
const GIF_DURATION_MS = 5042;

export function BotMascot({ size = 96 }: { size?: number }) {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * BOT_GIFS.length)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => {
        let next = Math.floor(Math.random() * (BOT_GIFS.length - 1));
        if (next >= prev) next++;
        return next;
      });
    }, GIF_DURATION_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <img
      src={BOT_GIFS[index]}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        objectFit: "cover",
        display: "block",
      }}
    />
  );
}
