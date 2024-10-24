import pygame
import random
import json
import os
import webbrowser

# Initialize Pygame
pygame.init()

# Screen dimensions
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600

# Colors
WHITE = (240, 240, 240)
RED = (255, 69, 0)
BLACK = (10, 10, 10)
GREEN = (34, 139, 34)
BLUE = (0, 128, 255)
BUTTON_COLOR = (50, 205, 50)
DARK_GREY = (50, 50, 50)
LIGHT_BLUE = (173, 216, 230)
LIGHT_GREEN = (144, 238, 144)
GREY = (200, 200, 200)

# Create the window with caption
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('WPAFB Gate Simulation - Avoid the Bollards')

# Load images
try:
    visitor_image = pygame.image.load('visitor.png')  # Replace with your image file
    bollard_image = pygame.image.load('bollard.png')  # Replace with your image file
except pygame.error as e:
    print(f"Error loading images: {e}")
    pygame.quit()
    exit()

# Resize images to fit the game (Visitor is larger now)
visitor_image = pygame.transform.scale(visitor_image, (100, 100))
bollard_image = pygame.transform.scale(bollard_image, (50, 50))

# Fonts
font = pygame.font.SysFont("Arial", 36)
game_over_font = pygame.font.SysFont("Arial", 64)
title_font = pygame.font.SysFont("Arial", 48, bold=True)
subtitle_font = pygame.font.SysFont("Arial", 36, bold=True)
button_font = pygame.font.SysFont("Arial", 36)
credit_font = pygame.font.SysFont("Arial", 20)

# Leaderboard file
LEADERBOARD_FILE = 'leaderboard.json'

# Visitor properties
visitor_x = SCREEN_WIDTH // 2 - 50  # Centered horizontally (larger visitor)
visitor_y = SCREEN_HEIGHT - 150  # Starting closer to the bottom
visitor_speed = 7  # Increase movement speed

# Bollard properties
bollard_width = 50
bollard_height = 50
bollard_speed = 7
bollard_list = []

# Health and score
visitor_health = 3
score = 0

# Add initial bollards
for _ in range(5):
    x_pos = random.randint(0, SCREEN_WIDTH - bollard_width)
    y_pos = random.randint(-150, -50)  # Start off-screen
    bollard_list.append([x_pos, y_pos])

# Function to draw visitor
def draw_visitor(x, y):
    screen.blit(visitor_image, (x, y))

# Function to draw bollards
def draw_bollards(bollard_list):
    for bollard in bollard_list:
        screen.blit(bollard_image, (bollard[0], bollard[1]))

# Function to check for collisions
def check_collision(bollard_list, visitor_x, visitor_y):
    for bollard in bollard_list:
        if (bollard[1] + bollard_height > visitor_y and
            bollard[1] < visitor_y + 100 and  # Adjust for larger visitor
            bollard[0] + bollard_width > visitor_x and
            bollard[0] < visitor_x + 100):
            return True
    return False

# Button Class for better GUI management
class Button:
    def __init__(self, rect, color, text, text_color=WHITE, hover_color=LIGHT_GREEN, font=button_font):
        self.rect = pygame.Rect(rect)
        self.color = color
        self.text = text
        self.text_color = text_color
        self.hover_color = hover_color
        self.font = font
        self.hovered = False

    def draw(self, surface):
        current_color = self.hover_color if self.hovered else self.color
        pygame.draw.rect(surface, current_color, self.rect, border_radius=10)
        pygame.draw.rect(surface, DARK_GREY, self.rect, width=2, border_radius=10)  # Border
        text_surf = self.font.render(self.text, True, self.text_color)
        text_rect = text_surf.get_rect(center=self.rect.center)
        surface.blit(text_surf, text_rect)

    def is_hovered(self, mouse_pos):
        return self.rect.collidepoint(mouse_pos)

    def is_clicked(self, mouse_pos):
        return self.rect.collidepoint(mouse_pos)

# Function to display the landing page with enhanced styling
def show_landing_page():
    global running
    # Define buttons
    start_button = Button(
        rect=(SCREEN_WIDTH // 2 - 100, SCREEN_HEIGHT // 2, 200, 80),
        color=BUTTON_COLOR,
        text="Start"
    )
    leaderboard_button = Button(
        rect=(SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2 + 100, 300, 80),
        color=BUTTON_COLOR,
        text="View Leaderboard"
    )
    # GitHub Link
    repo_rect = pygame.Rect(SCREEN_WIDTH // 2 - 280, SCREEN_HEIGHT // 2 + 260, 560, 20)

    waiting = True
    while waiting:
        screen.fill(LIGHT_BLUE)  # Set background to light blue for a sky-like effect

        # Render texts
        title_text = title_font.render("You Are Approaching WPAFB Gate", True, DARK_GREY)
        subtitle_text = subtitle_font.render("Good Luck!", True, DARK_GREY)
        created_by_text = credit_font.render("Created by SSgt King", True, DARK_GREY)
        repo_text = credit_font.render("Click here to see the project -> github.com/lordbuffcloud/bollard_striker", True, BLUE)

        # Position texts
        screen.blit(title_text, (SCREEN_WIDTH // 2 - title_text.get_width() // 2, SCREEN_HEIGHT // 2 - 200))
        screen.blit(subtitle_text, (SCREEN_WIDTH // 2 - subtitle_text.get_width() // 2, SCREEN_HEIGHT // 2 - 150))

        # Draw buttons
        mouse_pos = pygame.mouse.get_pos()
        start_button.hovered = start_button.is_hovered(mouse_pos)
        leaderboard_button.hovered = leaderboard_button.is_hovered(mouse_pos)
        start_button.draw(screen)
        leaderboard_button.draw(screen)

        # Draw credits and GitHub link
        screen.blit(created_by_text, (SCREEN_WIDTH // 2 - created_by_text.get_width() // 2, SCREEN_HEIGHT // 2 + 220))
        screen.blit(repo_text, (SCREEN_WIDTH // 2 - repo_text.get_width() // 2, SCREEN_HEIGHT // 2 + 260))
        pygame.draw.rect(screen, GREY, repo_rect, 1)  # Underline for GitHub link

        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if start_button.is_clicked(mouse_pos):
                    waiting = False  # Start the game
                elif leaderboard_button.is_clicked(mouse_pos):
                    show_leaderboard()  # Show leaderboard when clicked
                # Detecting click on the GitHub link
                if repo_rect.collidepoint(mouse_pos):
                    webbrowser.open("https://github.com/lordbuffcloud/bollard_striker")

# Function to ask for player's name and update the leaderboard
def get_player_name():
    player_name = ''
    input_active = True
    input_rect = pygame.Rect(SCREEN_WIDTH // 2 - 200, SCREEN_HEIGHT // 2 - 50, 400, 50)
    color_inactive = GREY
    color_active = BLUE
    color = color_inactive
    while input_active:
        screen.fill(WHITE)
        # Render prompt
        name_prompt = font.render("Enter your name:", True, BLACK)
        screen.blit(name_prompt, (SCREEN_WIDTH // 2 - name_prompt.get_width() // 2, SCREEN_HEIGHT // 2 - 100))
        # Render input box
        pygame.draw.rect(screen, color, input_rect, 2)
        # Render current name
        name_surf = font.render(player_name, True, BLACK)
        screen.blit(name_surf, (input_rect.x + 10, input_rect.y + 10))
        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                # If the user clicked on the input_box rect
                if input_rect.collidepoint(event.pos):
                    color = color_active
                else:
                    color = color_inactive
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN:
                    if player_name.strip() != '':
                        input_active = False
                elif event.key == pygame.K_BACKSPACE:
                    player_name = player_name[:-1]
                else:
                    if len(player_name) < 20:  # Limit name length
                        player_name += event.unicode
    return player_name

# Function to update and save the leaderboard
def update_leaderboard(player_name, score):
    leaderboard = []  # Initialize an empty leaderboard

    # Check if the file exists and contains valid JSON
    if os.path.exists(LEADERBOARD_FILE):
        try:
            with open(LEADERBOARD_FILE, 'r') as f:
                leaderboard = json.load(f)
        except json.JSONDecodeError:
            print("Leaderboard file is empty or corrupted. Initializing new leaderboard.")

    # Add the new score
    leaderboard.append({'name': player_name, 'score': score})
    # Sort the leaderboard by score in descending order and keep the top 5 scores
    leaderboard = sorted(leaderboard, key=lambda x: x['score'], reverse=True)[:5]

    # Save the updated leaderboard back to the file
    with open(LEADERBOARD_FILE, 'w') as f:
        json.dump(leaderboard, f)

# Function to display the leaderboard with a Back button
def show_leaderboard():
    back_button = Button(
        rect=(SCREEN_WIDTH // 2 - 75, SCREEN_HEIGHT - 100, 150, 50),
        color=BUTTON_COLOR,
        text="Back"
    )
    while True:
        screen.fill(WHITE)
        # Render leaderboard title
        leaderboard_title = font.render("Leaderboard", True, BLACK)
        screen.blit(leaderboard_title, (SCREEN_WIDTH // 2 - leaderboard_title.get_width() // 2, 50))

        # Load leaderboard data
        if os.path.exists(LEADERBOARD_FILE):
            try:
                with open(LEADERBOARD_FILE, 'r') as f:
                    leaderboard = json.load(f)
            except json.JSONDecodeError:
                leaderboard = []
        else:
            leaderboard = []

        # Display leaderboard entries
        y_offset = 150
        for entry in leaderboard:
            entry_text = font.render(f"{entry['name']}: {entry['score']}", True, BLACK)
            screen.blit(entry_text, (SCREEN_WIDTH // 2 - entry_text.get_width() // 2, y_offset))
            y_offset += 50

        # Draw Back button
        mouse_pos = pygame.mouse.get_pos()
        back_button.hovered = back_button.is_hovered(mouse_pos)
        back_button.draw(screen)

        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if back_button.is_clicked(mouse_pos):
                    return  # Return to the previous screen

# Function to display Game Over screen and get player's name
def show_game_over_screen(final_score):
    player_name = get_player_name()
    update_leaderboard(player_name, final_score)
    screen.fill(WHITE)
    # Render texts
    game_over_text = game_over_font.render("GAME OVER", True, RED)
    score_text = font.render(f"Your Final Score: {final_score}", True, BLACK)
    created_by_text = credit_font.render("Created by SSgt King", True, DARK_GREY)
    fun_message_text = font.render("Have fun with the AFJIS report!", True, BLACK)

    # Position texts
    screen.blit(game_over_text, (SCREEN_WIDTH // 2 - game_over_text.get_width() // 2, SCREEN_HEIGHT // 2 - 200))
    screen.blit(score_text, (SCREEN_WIDTH // 2 - score_text.get_width() // 2, SCREEN_HEIGHT // 2 - 100))
    screen.blit(created_by_text, (SCREEN_WIDTH // 2 - created_by_text.get_width() // 2, SCREEN_HEIGHT // 2 - 50))
    screen.blit(fun_message_text, (SCREEN_WIDTH // 2 - fun_message_text.get_width() // 2, SCREEN_HEIGHT // 2))

    pygame.display.flip()
    pygame.time.delay(3000)  # Display the screen for 3 seconds before showing the leaderboard
    show_leaderboard()

# Main game loop
def main_game():
    global visitor_x, visitor_y, visitor_health, score
    running = True
    clock = pygame.time.Clock()

    while running:
        screen.fill(WHITE)

        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()

        # Get key presses for movement
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] and visitor_x > 0:
            visitor_x -= visitor_speed
        if keys[pygame.K_RIGHT] and visitor_x < SCREEN_WIDTH - 100:
            visitor_x += visitor_speed

        # Update bollard positions
        for bollard in bollard_list:
            bollard[1] += bollard_speed
            # If a bollard goes off-screen, reset it
            if bollard[1] > SCREEN_HEIGHT:
                bollard[1] = random.randint(-150, -50)
                bollard[0] = random.randint(0, SCREEN_WIDTH - bollard_width)
                score += 1  # Increase score when bollard is avoided

        # Draw visitor and bollards
        draw_visitor(visitor_x, visitor_y)
        draw_bollards(bollard_list)

        # Check for collisions
        if check_collision(bollard_list, visitor_x, visitor_y):
            visitor_health -= 1
            # Reset bollard positions after collision
            for bollard in bollard_list:
                bollard[1] = random.randint(-150, -50)
                bollard[0] = random.randint(0, SCREEN_WIDTH - bollard_width)
            if visitor_health <= 0:
                show_game_over_screen(score)
                running = False

        # Display the score and health
        score_text = font.render(f"Score: {score}", True, BLACK)
        health_text = font.render(f"Health: {visitor_health}", True, RED)
        screen.blit(score_text, (10, 10))
        screen.blit(health_text, (10, 50))

        pygame.display.flip()
        clock.tick(60)

# Start the game by showing the landing page
show_landing_page()
main_game()

# Quit the game
pygame.quit()
