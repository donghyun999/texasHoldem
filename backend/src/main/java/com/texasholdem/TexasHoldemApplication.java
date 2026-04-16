package com.texasholdem;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TexasHoldemApplication {

    public static void main(String[] args) {
        SpringApplication.run(TexasHoldemApplication.class, args);
    }
}
